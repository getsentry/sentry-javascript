import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sentryOrchestrionPlugin } from '../../src/orchestrion/bundler/vite';

// Creates an isolated project root whose `node_modules` contains only the given
// packages, so the register plugin's dependency-resolution allow-list is
// deterministic (an OS temp dir has no ambient `node_modules` to leak in).
function makeRootWithDeps(packages: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'orchestrion-root-'));
  for (const pkg of packages) {
    const pkgDir = join(root, 'node_modules', pkg);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: pkg, version: '1.0.0' }));
  }
  return root;
}

const REGISTER_MODULE_ID = 'virtual:@sentry/orchestrion-register-integrations';
const RESOLVED_REGISTER_MODULE_ID = `\0${REGISTER_MODULE_ID}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRegisterPlugin(plugins: any[]): any {
  return plugins.find(p => p.name === 'sentry-orchestrion-register-integrations');
}

// A Vite/Rollup plugin `this` context reporting `id` as an entry (or not),
// optionally in a given environment consumer ('client' | 'server').
function ctx({ isEntry = true, consumer }: { isEntry?: boolean; consumer?: string } = {}): unknown {
  return {
    getModuleInfo: () => ({ isEntry }),
    ...(consumer ? { environment: { config: { consumer } } } : {}),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runTransform(
  plugin: any,
  code: string,
  context: unknown = ctx(),
  id = 'entry.js',
): { code: string; map: unknown } | null {
  return plugin.transform.call(context, code, id);
}

// A dev-server `this` context: no `getModuleInfo` — reading `.isEntry` throws in
// the real dev server, so the serve path must never call it.
function serveCtx({ name = 'ssr', consumer }: { name?: string; consumer?: string } = {}): unknown {
  return { environment: { name, ...(consumer ? { config: { consumer } } : {}) } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeServePlugin(): any {
  const plugin = getRegisterPlugin(sentryOrchestrionPlugin({ registerIntegrations: true }));
  plugin.configResolved({ command: 'serve' });
  return plugin;
}

describe('sentryOrchestrionPlugin — registerIntegrations', () => {
  it('omits the register plugin by default', () => {
    expect(getRegisterPlugin(sentryOrchestrionPlugin())).toBeUndefined();
  });

  it('omits the register plugin when registerIntegrations is false', () => {
    expect(getRegisterPlugin(sentryOrchestrionPlugin({ registerIntegrations: false }))).toBeUndefined();
  });

  it('includes the register plugin when registerIntegrations is true', () => {
    expect(getRegisterPlugin(sentryOrchestrionPlugin({ registerIntegrations: true }))).toBeDefined();
  });

  describe('configEnvironment (dev dep-optimizer instrumentation)', () => {
    const plugin = getRegisterPlugin(sentryOrchestrionPlugin({ registerIntegrations: true }));

    it('adds an esbuild code-transform plugin to the optimizer for server environments', () => {
      const result = plugin.configEnvironment('ssr');
      const plugins = result?.optimizeDeps?.esbuildOptions?.plugins;

      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.map((p: { name: string }) => p.name)).toContain('code-transformer');
    });

    it('does not instrument the client environment', () => {
      expect(plugin.configEnvironment('client')).toBeUndefined();
    });
  });

  describe('virtual registration module', () => {
    const plugin = getRegisterPlugin(sentryOrchestrionPlugin({ registerIntegrations: true }));

    it('resolves the virtual id to the synthetic id', () => {
      expect(plugin.resolveId(REGISTER_MODULE_ID)).toBe(RESOLVED_REGISTER_MODULE_ID);
    });

    it('does not resolve unrelated ids', () => {
      expect(plugin.resolveId('some-other-module')).toBeNull();
    });

    it('loads a side-effect module that imports factories from the absolute ESM build', () => {
      const freshPlugin = getRegisterPlugin(sentryOrchestrionPlugin({ registerIntegrations: true }));
      freshPlugin.configResolved({ command: 'build', root: makeRootWithDeps(['mysql']) });
      const result = freshPlugin.load(RESOLVED_REGISTER_MODULE_ID);
      const normalizedCode = result?.code.replaceAll('\\', '/');

      expect(normalizedCode).toContain('/server-utils/build/esm/orchestrion/index.js');
      expect(normalizedCode).not.toContain('/build/cjs/');
      // The whole-map `registerChannelIntegrations()` call would defeat tree-shaking; the module
      // must import individual factories by name and build the registry inline instead.
      expect(result?.code).not.toContain('registerChannelIntegrations');
      expect(result?.code).toContain('marker.integrations = [');
      expect(result?.moduleSideEffects).toBe(true);
    });

    it('imports only the factories whose package the app depends on', () => {
      const freshPlugin = getRegisterPlugin(sentryOrchestrionPlugin({ registerIntegrations: true }));
      freshPlugin.configResolved({ command: 'build', root: makeRootWithDeps(['mysql']) });
      const { code } = freshPlugin.load(RESOLVED_REGISTER_MODULE_ID);

      expect(code).toContain('import { mysqlChannelIntegration }');
      expect(code).toContain('{ factory: mysqlChannelIntegration, modules: ["mysql"] }');
      // No `pg` in the app's deps → the postgres subscriber must not be imported.
      expect(code).not.toContain('postgresChannelIntegration');
      expect(code).not.toContain('anthropicChannelIntegration');
    });

    it('resolves an integration when any of its packages is present (pg-pool → postgres)', () => {
      const freshPlugin = getRegisterPlugin(sentryOrchestrionPlugin({ registerIntegrations: true }));
      freshPlugin.configResolved({ command: 'build', root: makeRootWithDeps(['pg-pool']) });
      const { code } = freshPlugin.load(RESOLVED_REGISTER_MODULE_ID);

      expect(code).toContain('import { postgresChannelIntegration }');
      expect(code).toContain('modules: ["pg","pg-pool"]');
    });

    it('registers nothing when the app depends on no instrumented package', () => {
      const freshPlugin = getRegisterPlugin(sentryOrchestrionPlugin({ registerIntegrations: true }));
      freshPlugin.configResolved({ command: 'build', root: makeRootWithDeps([]) });
      const { code } = freshPlugin.load(RESOLVED_REGISTER_MODULE_ID);

      expect(code).toContain('marker.integrations = [];');
      expect(code).not.toContain('import {');
    });

    it('does not load unrelated ids', () => {
      expect(plugin.load('some-other-module')).toBeNull();
    });
  });

  describe('transform (build)', () => {
    const plugin = getRegisterPlugin(sentryOrchestrionPlugin({ registerIntegrations: true }));

    it('injects the virtual registration import into the entry module', () => {
      const result = runTransform(plugin, 'export default {};\n', ctx({ isEntry: true }));

      expect(result?.code).toContain(`import "${REGISTER_MODULE_ID}";`);
      expect(result?.map).toBeTruthy();
    });

    it('injects before a re-exported worker can initialize the SDK', () => {
      const result = runTransform(plugin, `export { default } from './worker';\n`, ctx({ isEntry: true }));

      expect(result?.code.indexOf(REGISTER_MODULE_ID)).toBeLessThan(
        result?.code.indexOf("export { default } from './worker'"),
      );
    });

    it('preserves a Node entry shebang while injecting before its module body', () => {
      const result = runTransform(plugin, '#!/usr/bin/env node\nSentry.init({});\n', ctx({ isEntry: true }));

      expect(result?.code).toBe(`#!/usr/bin/env node\nimport "${REGISTER_MODULE_ID}";\nSentry.init({});\n`);
    });

    it('does not inject into non-entry modules', () => {
      const code = `import * as Sentry from '@sentry/cloudflare';\nSentry.startSpan({}, () => {});\n`;
      expect(runTransform(plugin, code, ctx({ isEntry: false }))).toBeNull();
    });

    it('does not double-inject when registration is already present', () => {
      const code = `import "${REGISTER_MODULE_ID}";\nexport default {};\n`;
      expect(runTransform(plugin, code, ctx({ isEntry: true }))).toBeNull();
    });

    it('does not confuse a mention of the registration function with the injection sentinel', () => {
      const code = `// registerChannelIntegrations is injected by the plugin\nexport default {};\n`;
      expect(runTransform(plugin, code, ctx({ isEntry: true }))?.code).toContain(REGISTER_MODULE_ID);
    });

    it('does not inject into client-environment entries', () => {
      expect(runTransform(plugin, 'export default {};\n', ctx({ isEntry: true, consumer: 'client' }))).toBeNull();
    });

    it('injects into server-environment entries', () => {
      const result = runTransform(plugin, 'export default {};\n', ctx({ isEntry: true, consumer: 'server' }));

      expect(result?.code).toContain(REGISTER_MODULE_ID);
    });

    it('assumes server when no environment info is available (classic Vite)', () => {
      const noEnvCtx = { getModuleInfo: () => ({ isEntry: true }) };
      const result = runTransform(plugin, 'export default {};\n', noEnvCtx);

      expect(result?.code).toContain(REGISTER_MODULE_ID);
    });
  });

  describe('transform (dev / vite serve)', () => {
    // `serveCtx` intentionally has no `getModuleInfo` — reading `.isEntry`
    // throws in the real dev server, so the serve path must never call it.
    it('injects into the first server source module (the entry) without reading isEntry', () => {
      const plugin = makeServePlugin();
      const result = runTransform(plugin, 'export default {};\n', serveCtx(), '/app/src/index.ts');

      expect(result?.code).toContain(`import "${REGISTER_MODULE_ID}";`);
    });

    it('injects only once per environment', () => {
      const plugin = makeServePlugin();
      const first = runTransform(plugin, 'export default {};\n', serveCtx({ name: 'worker' }), '/app/src/index.ts');
      const second = runTransform(plugin, 'export const x = 1;\n', serveCtx({ name: 'worker' }), '/app/src/util.ts');

      expect(first?.code).toContain(REGISTER_MODULE_ID);
      expect(second).toBeNull();
    });

    it('injects once per distinct environment', () => {
      const plugin = makeServePlugin();
      const worker = runTransform(plugin, 'export default {};\n', serveCtx({ name: 'worker' }), '/app/src/index.ts');
      const ssr = runTransform(plugin, 'export default {};\n', serveCtx({ name: 'ssr' }), '/app/src/index.ts');

      expect(worker?.code).toContain(REGISTER_MODULE_ID);
      expect(ssr?.code).toContain(REGISTER_MODULE_ID);
    });

    it('skips pre-bundled deps, node_modules source, and virtual modules', () => {
      for (const id of [
        '/app/node_modules/.vite/deps_worker/mysql.js',
        '/app/node_modules/mysql/index.js',
        '\0virtual:some-module',
      ]) {
        const plugin = makeServePlugin();
        expect(runTransform(plugin, 'export default {};\n', serveCtx({ name: 'worker' }), id)).toBeNull();
      }
    });

    it('does not inject into client environments', () => {
      const plugin = makeServePlugin();
      const result = runTransform(
        plugin,
        'export default {};\n',
        serveCtx({ name: 'client', consumer: 'client' }),
        '/app/src/index.ts',
      );

      expect(result).toBeNull();
    });
  });
});
