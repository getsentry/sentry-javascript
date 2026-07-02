import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { sentryCloudflareAutoInstrumentPlugin } from '../../src/vite/autoInstrument';

function parseJS(code: string) {
  return parse(code, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as { body: any[] };
}

function writeTempDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sentry-cf-'));
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

  it('transforms the entry file', () => {
    const { transform: tx, entryPath } = createPlugin('main = "src/index.ts"');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = tx(code, entryPath);
    expect(result).toBeDefined();
    expect(result.code).toContain('__SENTRY__.withSentry(');
  });

  it('prepends the orchestrion bundler marker to the entry', () => {
    const { transform: tx, entryPath } = createPlugin('main = "src/index.ts"');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = tx(code, entryPath);
    expect(result.code).toContain('globalThis.__SENTRY_ORCHESTRION__.bundler = true;');
  });

  it('prepends the marker even when the entry is already wrapped manually', () => {
    const { transform: tx, entryPath } = createPlugin('main = "src/index.ts"');

    const code = [
      "import { withSentry } from '@sentry/cloudflare';",
      'export default withSentry((env) => ({}), { fetch() {} });',
    ].join('\n');
    const result = tx(code, entryPath);
    expect(result).toBeDefined();
    expect(result.code).toContain('globalThis.__SENTRY_ORCHESTRION__.bundler = true;');
    expect(result.code).not.toContain('__SENTRY_DEFAULT_EXPORT__');
  });

  it('skips non-entry files', () => {
    const { transform: tx } = createPlugin('main = "src/index.ts"');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    expect(tx(code, '/some/other/file.ts')).toBeUndefined();
  });

  it('tolerates query params in module IDs', () => {
    const { transform: tx, entryPath } = createPlugin('main = "src/index.ts"');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = tx(code, `${entryPath}?worker_file`);
    expect(result).toBeDefined();
  });

  it('tolerates JS-flavored extension mismatches', () => {
    const { transform: tx, entryPath } = createPlugin('main = "src/index.ts"');
    const jsPath = entryPath.replace(/\.ts$/, '.js');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = tx(code, jsPath);
    expect(result).toBeDefined();
  });

  it('does not match a non-JS sibling sharing the entry basename', () => {
    const { transform: tx, entryPath } = createPlugin('main = "src/index.ts"');
    const cssPath = entryPath.replace(/\.ts$/, '.css');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    expect(tx(code, cssPath)).toBeUndefined();
  });

  it('matches Windows-style module IDs against the entry path', () => {
    const { transform: tx, entryPath } = createPlugin('main = "src/index.ts"');
    const windowsId = entryPath.replace(/\//g, '\\');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    expect(tx(code, windowsId)).toBeDefined();
  });

  it('skips modules served to the client environment', () => {
    const { entryPath, plugin } = createPlugin('main = "src/index.ts"');

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = plugin.transform.call(
      { parse: (c: string) => parseJS(c), environment: { name: 'client' } },
      code,
      entryPath,
    );
    expect(result).toBeUndefined();
  });

  it('warns when a configured DO class cannot be wrapped', () => {
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
    plugin.transform.call(
      { parse: (c: string) => parseJS(c), warn: (msg: string) => warnings.push(msg) },
      code,
      join(dir, 'index.ts'),
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('MyDO');
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

  it('imports the callback from an instrument.server file next to the entry', () => {
    const { transform: tx, entryPath } = createPluginWithDir({
      'wrangler.toml': 'main = "index.ts"',
      'instrument.server.ts': 'export default (env) => ({ dsn: env.SENTRY_DSN });',
    });

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = tx(code, entryPath)!;
    expect(result).toBeDefined();
    expect(result.code).toContain("import __SENTRY_OPTIONS_CALLBACK__ from './instrument.server.ts';");
    expect(result.code).toContain('__SENTRY__.withSentry(__SENTRY_OPTIONS_CALLBACK__,');
  });

  it('detects alternative extensions (e.g. .mjs)', () => {
    const { transform: tx, entryPath } = createPluginWithDir({
      'wrangler.toml': 'main = "index.ts"',
      'instrument.server.mjs': 'export default () => ({ dsn: "x" });',
    });

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = tx(code, entryPath)!;
    expect(result.code).toContain("import __SENTRY_OPTIONS_CALLBACK__ from './instrument.server.mjs';");
  });

  it('emits a resolvable import for .cjs instrument files', () => {
    const { transform: tx, entryPath } = createPluginWithDir({
      'wrangler.toml': 'main = "index.ts"',
      'instrument.server.cjs': 'module.exports = () => ({ dsn: "x" });',
    });

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = tx(code, entryPath)!;
    expect(result.code).toContain("import __SENTRY_OPTIONS_CALLBACK__ from './instrument.server.cjs';");
  });

  it('falls back to an env-based callback when no instrument file exists', () => {
    const { transform: tx, entryPath } = createPluginWithDir({ 'wrangler.toml': 'main = "index.ts"' });

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = tx(code, entryPath)!;
    expect(result.code).not.toContain('__SENTRY_OPTIONS_CALLBACK__');
    expect(result.code).toContain('__SENTRY__.withSentry(() => undefined,');
  });

  it('applies the detected callback to Durable Object classes too', () => {
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
    const result = tx(code, entryPath)!;
    expect(result.code).toContain('__SENTRY__.instrumentDurableObjectWithSentry(__SENTRY_OPTIONS_CALLBACK__,');
  });
});
