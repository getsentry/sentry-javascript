import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'acorn';
import { afterEach, describe, expect, it } from 'vitest';
import { sentryCloudflareAutoInstrumentPlugin } from '../../src/vite/autoInstrument';

function parseJS(code: string) {
  return parse(code, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as { body: any[] };
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function writeTempDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sentry-cf-'));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Plugin integration (transform hook with mock this.parse)
// ---------------------------------------------------------------------------

describe('sentryCloudflareAutoInstrumentPlugin', () => {
  function createPlugin(wranglerToml: string) {
    const dir = writeTempDir({ 'wrangler.toml': wranglerToml });
    const plugin = sentryCloudflareAutoInstrumentPlugin();
    plugin.configResolved({ root: dir });

    const mainMatch = wranglerToml.match(/main\s*=\s*"([^"]+)"/);
    const entryPath = join(dir, mainMatch?.[1] ?? 'src/index.ts');

    // Bind a mock `this.parse` that delegates to acorn.
    const boundTransform = (code: string, id: string) =>
      plugin.transform.call({ parse: (c: string) => parseJS(c) }, code, id);

    return { transform: boundTransform, entryPath, plugin };
  }

  it('transforms the entry file', async () => {
    const { transform: tx, entryPath } = createPlugin('main = "src/index.ts"');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = await tx(code, entryPath);
    expect(result).toBeDefined();
    expect(result.code).toContain('__SENTRY__.withSentry(');
  });

  it('leaves an already-manually-wrapped entry untouched', async () => {
    const { transform: tx, entryPath } = createPlugin('main = "src/index.ts"');

    const code = [
      "import { withSentry } from '@sentry/cloudflare';",
      'export default withSentry((env) => ({}), { fetch() {} });',
    ].join('\n');
    // No DO classes configured and nothing to wrap → no transform result.
    expect(await tx(code, entryPath)).toBeUndefined();
  });

  it('skips non-entry files', async () => {
    const { transform: tx } = createPlugin('main = "src/index.ts"');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    expect(await tx(code, '/some/other/file.ts')).toBeUndefined();
  });

  it('tolerates query params in module IDs', async () => {
    const { transform: tx, entryPath } = createPlugin('main = "src/index.ts"');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = tx(code, `${entryPath}?worker_file`);
    expect(result).toBeDefined();
  });

  it('tolerates JS-flavored extension mismatches', async () => {
    const { transform: tx, entryPath } = createPlugin('main = "src/index.ts"');
    const jsPath = entryPath.replace(/\.ts$/, '.js');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = tx(code, jsPath);
    expect(result).toBeDefined();
  });

  it('does not match a non-JS sibling sharing the entry basename', async () => {
    const { transform: tx, entryPath } = createPlugin('main = "src/index.ts"');
    const cssPath = entryPath.replace(/\.ts$/, '.css');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    expect(await tx(code, cssPath)).toBeUndefined();
  });

  it('matches Windows-style module IDs against the entry path', async () => {
    const { transform: tx, entryPath } = createPlugin('main = "src/index.ts"');
    const windowsId = entryPath.replace(/\//g, '\\');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    expect(await tx(code, windowsId)).toBeDefined();
  });

  it('skips modules served to the client environment', async () => {
    const { entryPath, plugin } = createPlugin('main = "src/index.ts"');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = await plugin.transform.call(
      { parse: (c: string) => parseJS(c), environment: { name: 'client' } },
      code,
      entryPath,
    );
    expect(result).toBeUndefined();
  });

  it('wraps a configured workflow class in the entry', async () => {
    const dir = writeTempDir({
      'wrangler.toml': [
        'main = "index.ts"',
        '',
        '[[workflows]]',
        'name = "my-workflow"',
        'binding = "MY_WF"',
        'class_name = "MyWorkflow"',
      ].join('\n'),
    });
    const plugin = sentryCloudflareAutoInstrumentPlugin();
    plugin.configResolved({ root: dir });

    const code = ['class WorkflowEntrypoint {}', 'export class MyWorkflow extends WorkflowEntrypoint {}'].join('\n');
    const result = await plugin.transform.call({ parse: (c: string) => parseJS(c) }, code, join(dir, 'index.ts'));

    expect(result).toBeDefined();
    expect(result.code).toContain('__SENTRY__.instrumentWorkflowWithSentry(');
  });

  it('wraps a directly-exported WorkerEntrypoint class (structural, no config)', async () => {
    const { transform: tx, entryPath } = createPlugin('main = "index.ts"');

    const code = [
      "import { WorkerEntrypoint } from 'cloudflare:workers';",
      'export class AdminEntry extends WorkerEntrypoint {',
      '  fetch() { return new Response("admin"); }',
      '}',
    ].join('\n');
    const result = await tx(code, entryPath);

    expect(result).toBeDefined();
    expect(result.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        "import { WorkerEntrypoint } from 'cloudflare:workers';",
        'class __SENTRY_ORIGINAL_AdminEntry__ extends WorkerEntrypoint {',
        '  fetch() { return new Response("admin"); }',
        '}',
        'export const AdminEntry = __SENTRY__.withSentry(() => undefined, __SENTRY_ORIGINAL_AdminEntry__);',
        '',
      ].join('\n'),
    );
  });

  it('wraps a self-bound WorkerEntrypoint whose base class lives in another module (config fallback)', async () => {
    const dir = writeTempDir({
      'wrangler.json': JSON.stringify({
        name: 'worker-self',
        main: 'index.ts',
        services: [{ binding: 'SELF', service: 'worker-self', entrypoint: 'AdminEntry' }],
      }),
    });
    const plugin = sentryCloudflareAutoInstrumentPlugin();
    plugin.configResolved({ root: dir });

    // Base class is imported, so structural detection can't see it — the config
    // self-binding supplies the name instead.
    const code = ["import { BaseEntry } from './base';", 'export class AdminEntry extends BaseEntry {}'].join('\n');
    const result = await plugin.transform.call({ parse: (c: string) => parseJS(c) }, code, join(dir, 'index.ts'));

    expect(result).toBeDefined();
    expect(result.code).toContain('export const AdminEntry = __SENTRY__.withSentry(');
  });

  it('wraps a WorkerEntrypoint named via a services[].entrypoint self-binding (jsonc config)', async () => {
    // Mirrors the `worker-workerentrypoint-rpc` integration test, which declares
    // its entrypoints through `services[].entrypoint` in a wrangler.jsonc.
    const dir = writeTempDir({
      'wrangler.jsonc': [
        '{',
        '  "name": "my-worker",',
        '  "main": "index.ts",',
        '  "services": [',
        '    { "binding": "SELF", "service": "my-worker", "entrypoint": "BindingEntrypoint" },',
        '  ],',
        '}',
      ].join('\n'),
    });
    const plugin = sentryCloudflareAutoInstrumentPlugin();
    plugin.configResolved({ root: dir });

    // Base class imported from another module, so only the config self-binding
    // identifies `BindingEntrypoint` as an entrypoint to wrap.
    const code = [
      "import { BaseEntrypoint } from './base';",
      'export class BindingEntrypoint extends BaseEntrypoint {}',
    ].join('\n');
    const result = await plugin.transform.call({ parse: (c: string) => parseJS(c) }, code, join(dir, 'index.ts'));

    expect(result).toBeDefined();
    expect(result.code).toContain('export const BindingEntrypoint = __SENTRY__.withSentry(');
  });

  it('does not wrap an entrypoint that is neither detected nor self-bound', async () => {
    const dir = writeTempDir({
      'wrangler.json': JSON.stringify({
        name: 'worker-self',
        main: 'index.ts',
        services: [{ binding: 'OTHER', service: 'worker-x', entrypoint: 'RemoteEntry' }],
      }),
    });
    const plugin = sentryCloudflareAutoInstrumentPlugin();
    plugin.configResolved({ root: dir });

    // Base class imported (structural blind), and the only service binding is
    // outward (names `worker-x`'s export), so there is nothing to wrap here.
    const code = ["import { BaseEntry } from './base';", 'export class RemoteEntry extends BaseEntry {}'].join('\n');
    const result = await plugin.transform.call({ parse: (c: string) => parseJS(c) }, code, join(dir, 'index.ts'));

    expect(result).toBeUndefined();
  });

  // An Agent is a Durable Object, so wrangler can only ever list it under
  // `durable_objects.bindings` — the base class is what tells the two apart.
  describe('agent classes', () => {
    const AGENT_WRANGLER = [
      'main = "index.ts"',
      '',
      '[[durable_objects.bindings]]',
      'name = "MY_AGENT"',
      'class_name = "MyAgent"',
    ].join('\n');

    /**
     * Plugin bound to a real temp directory. Sibling modules are written to disk because that is
     * how detection reads them — the plugin context intentionally exposes no `load`, since awaiting
     * it inside a transform hook deadlocks the build.
     */
    function createAgentPlugin(files: Record<string, string>, wrangler = AGENT_WRANGLER) {
      const dir = writeTempDir({ 'wrangler.toml': wrangler, ...files });
      const plugin = sentryCloudflareAutoInstrumentPlugin();
      plugin.configResolved({ root: dir });

      const ctx = {
        parse: (c: string) => parseJS(c),
        resolve: async (source: string) => ({ id: join(dir, `${source.replace(/^\.\//, '')}.ts`) }),
      };

      return (code: string) => plugin.transform.call(ctx, code, join(dir, 'index.ts'));
    }

    it('wraps an Agent declared in the entry with instrumentAgentWithSentry', async () => {
      const tx = createAgentPlugin({});
      const code = ["import { Agent } from 'agents';", 'export class MyAgent extends Agent {}'].join('\n');

      const result = await tx(code);
      expect(result.code).toContain('export const MyAgent = __SENTRY__.instrumentAgentWithSentry(');
      expect(result.code).not.toContain('instrumentDurableObjectWithSentry');
    });

    it('wraps an AIChatAgent subclass with instrumentAgentWithSentry', async () => {
      const tx = createAgentPlugin({});
      const code = [
        "import { AIChatAgent } from '@cloudflare/ai-chat';",
        'export class MyAgent extends AIChatAgent {}',
      ].join('\n');

      const result = await tx(code);
      expect(result.code).toContain('export const MyAgent = __SENTRY__.instrumentAgentWithSentry(');
    });

    it('wraps an Agent whose base class lives in another module', async () => {
      const tx = createAgentPlugin({
        'base.ts': ["import { Agent } from 'agents';", 'export class MyBase extends Agent {}'].join('\n'),
      });
      const code = ["import { MyBase } from './base';", 'export class MyAgent extends MyBase {}'].join('\n');

      const result = await tx(code);
      expect(result.code).toContain('export const MyAgent = __SENTRY__.instrumentAgentWithSentry(');
    });

    it('keeps the Durable Object helper for a DO whose base class lives in another module', async () => {
      const tx = createAgentPlugin({
        'base.ts': [
          "import { DurableObject } from 'cloudflare:workers';",
          'export class MyBase extends DurableObject {}',
        ].join('\n'),
      });
      const code = ["import { MyBase } from './base';", 'export class MyAgent extends MyBase {}'].join('\n');

      const result = await tx(code);
      expect(result.code).toContain('export const MyAgent = __SENTRY__.instrumentDurableObjectWithSentry(');
      expect(result.code).not.toContain('instrumentAgentWithSentry');
    });

    it('does not warn about an Agent that was wrapped manually', async () => {
      const dir = writeTempDir({ 'wrangler.toml': AGENT_WRANGLER });
      const plugin = sentryCloudflareAutoInstrumentPlugin();
      plugin.configResolved({ root: dir });

      const warnings: string[] = [];
      const code = [
        "import * as Sentry from '@sentry/cloudflare';",
        "import { Agent } from 'agents';",
        'class MyAgentBase extends Agent {}',
        'export const MyAgent = Sentry.instrumentAgentWithSentry((env) => ({}), MyAgentBase);',
      ].join('\n');

      await plugin.transform.call(
        { parse: (c: string) => parseJS(c), warn: (msg: string) => warnings.push(msg) },
        code,
        join(dir, 'index.ts'),
      );

      expect(warnings).toEqual([]);
    });
  });

  it('warns when a configured DO class cannot be wrapped', async () => {
    const dir = writeTempDir({
      'wrangler.toml': [
        'main = "index.ts"',
        '',
        '[[durable_objects.bindings]]',
        'name = "MY_DO"',
        'class_name = "MyDO"',
      ].join('\n'),
    });
    const plugin = sentryCloudflareAutoInstrumentPlugin();
    plugin.configResolved({ root: dir });

    const warnings: string[] = [];
    const code = "export { MyDO } from './do';";
    await plugin.transform.call(
      { parse: (c: string) => parseJS(c), warn: (msg: string) => warnings.push(msg) },
      code,
      join(dir, 'index.ts'),
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('MyDO');
  });
});

describe('wranglerConfigPath option', () => {
  it('reads a custom-named wrangler config (e.g. wrangler.agent.jsonc)', async () => {
    const dir = writeTempDir({ 'wrangler.agent.jsonc': '{ "main": "src/agent.ts" }' });
    const plugin = sentryCloudflareAutoInstrumentPlugin({ wranglerConfigPath: './wrangler.agent.jsonc' });
    plugin.configResolved({ root: dir });

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = await plugin.transform.call({ parse: (c: string) => parseJS(c) }, code, join(dir, 'src/agent.ts'));

    expect(result).toBeDefined();
    expect(result.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        'const __SENTRY_DEFAULT_EXPORT__ = { fetch() { return new Response("ok"); } };',
        'export default __SENTRY__.withSentry(() => undefined, __SENTRY_DEFAULT_EXPORT__);',
        '',
      ].join('\n'),
    );
  });

  it('prefers the explicit path over default-name configs', async () => {
    const dir = writeTempDir({
      'wrangler.toml': 'main = "src/default.ts"',
      'wrangler.agent.jsonc': '{ "main": "src/agent.ts" }',
    });
    const plugin = sentryCloudflareAutoInstrumentPlugin({ wranglerConfigPath: 'wrangler.agent.jsonc' });
    plugin.configResolved({ root: dir });

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const tx = (id: string) => plugin.transform.call({ parse: (c: string) => parseJS(c) }, code, id);

    // The probed default config's entry must not be treated as the worker entry…
    expect(await tx(join(dir, 'src/default.ts'))).toBeUndefined();
    // …while the explicit config's entry is.
    expect(await tx(join(dir, 'src/agent.ts'))).toBeDefined();
  });

  it('warns with only the basename when the explicit path cannot be read', () => {
    const dir = writeTempDir({});
    const warnings: string[] = [];
    const plugin = sentryCloudflareAutoInstrumentPlugin({ wranglerConfigPath: 'nested/dir/wrangler.agent.jsonc' });
    plugin.configResolved({ root: dir, logger: { warn: msg => warnings.push(msg) } });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('wrangler.agent.jsonc');
    // The full path may leak a location the user doesn't want in build logs.
    expect(warnings[0]).not.toContain('nested/dir');
  });

  it('hints at the option when no default-named config is found', () => {
    const dir = writeTempDir({});
    const warnings: string[] = [];
    const plugin = sentryCloudflareAutoInstrumentPlugin();
    plugin.configResolved({ root: dir, logger: { warn: msg => warnings.push(msg) } });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('`wranglerConfigPath`');
  });
});

// ---------------------------------------------------------------------------
// instrument.server.* auto-detection (config from a conventional module)
// ---------------------------------------------------------------------------

describe('instrument file auto-detection', () => {
  function createPluginWithDir(files: Record<string, string>) {
    const dir = writeTempDir(files);
    const plugin = sentryCloudflareAutoInstrumentPlugin();
    plugin.configResolved({ root: dir });

    const mainMatch = files['wrangler.toml']?.match(/main\s*=\s*"([^"]+)"/);
    const entryPath = join(dir, mainMatch?.[1] ?? 'index.ts');

    const boundTransform = (code: string, id: string) =>
      plugin.transform.call({ parse: (c: string) => parseJS(c) }, code, id);

    return { transform: boundTransform, entryPath, dir };
  }

  it('imports the callback from an instrument.server file next to the entry', async () => {
    const { transform: tx, entryPath } = createPluginWithDir({
      'wrangler.toml': 'main = "index.ts"',
      'instrument.server.ts': 'export default (env) => ({ dsn: env.SENTRY_DSN });',
    });

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = await tx(code, entryPath)!;
    expect(result).toBeDefined();
    expect(result.code).toContain("import __SENTRY_OPTIONS_CALLBACK__ from './instrument.server.ts';");
    expect(result.code).toContain('__SENTRY__.withSentry(__SENTRY_OPTIONS_CALLBACK__,');
  });

  it('detects alternative extensions (e.g. .mjs)', async () => {
    const { transform: tx, entryPath } = createPluginWithDir({
      'wrangler.toml': 'main = "index.ts"',
      'instrument.server.mjs': 'export default () => ({ dsn: "x" });',
    });

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = await tx(code, entryPath)!;
    expect(result.code).toContain("import __SENTRY_OPTIONS_CALLBACK__ from './instrument.server.mjs';");
  });

  it('emits a resolvable import for .cjs instrument files', async () => {
    const { transform: tx, entryPath } = createPluginWithDir({
      'wrangler.toml': 'main = "index.ts"',
      'instrument.server.cjs': 'module.exports = () => ({ dsn: "x" });',
    });

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = await tx(code, entryPath)!;
    expect(result.code).toContain("import __SENTRY_OPTIONS_CALLBACK__ from './instrument.server.cjs';");
  });

  it('falls back to an env-based callback when no instrument file exists', async () => {
    const { transform: tx, entryPath } = createPluginWithDir({ 'wrangler.toml': 'main = "index.ts"' });

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = await tx(code, entryPath)!;
    expect(result.code).not.toContain('__SENTRY_OPTIONS_CALLBACK__');
    expect(result.code).toContain('__SENTRY__.withSentry(() => undefined,');
  });

  it('applies the detected callback to Durable Object classes too', async () => {
    const { transform: tx, entryPath } = createPluginWithDir({
      'wrangler.toml': [
        'main = "index.ts"',
        '',
        '[[durable_objects.bindings]]',
        'name = "MY_DO"',
        'class_name = "MyDO"',
      ].join('\n'),
      'instrument.server.ts': 'export default (env) => ({ dsn: env.SENTRY_DSN });',
    });

    const code = ['class DurableObject {}', 'export class MyDO extends DurableObject {}'].join('\n');
    const result = await tx(code, entryPath)!;
    expect(result.code).toContain('__SENTRY__.instrumentDurableObjectWithSentry(__SENTRY_OPTIONS_CALLBACK__,');
  });
});
