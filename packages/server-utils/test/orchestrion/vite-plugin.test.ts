import { describe, expect, it } from 'vitest';
import { sentryOrchestrionPlugin } from '../../src/orchestrion/bundler/vite';
import { INSTRUMENTED_MODULE_NAMES } from '../../src/orchestrion/config';

function getMarkerPlugin() {
  const plugins = sentryOrchestrionPlugin();
  const marker = plugins.find(p => p.name === 'sentry-orchestrion-marker');
  expect(marker).toBeDefined();
  return marker;
}

describe('sentryOrchestrionPlugin', () => {
  it('returns the marker plugin and the code transformer', () => {
    const plugins = sentryOrchestrionPlugin();
    expect(plugins.map(p => p.name)).toContain('sentry-orchestrion-marker');
    expect(plugins.map(p => p.name)).toContain('code-transformer');
  });

  it('force-bundles instrumented packages via ssr.noExternal', () => {
    const marker = getMarkerPlugin();
    expect(marker.config()).toEqual({ ssr: { noExternal: INSTRUMENTED_MODULE_NAMES } });
  });

  it('prepends the bundler marker banner to entry chunks', () => {
    const marker = getMarkerPlugin();
    const result = marker.renderChunk('console.log("app");', { isEntry: true });
    expect(result.code).toContain('globalThis.__SENTRY_ORCHESTRION__.bundler = true;');
    expect(result.map).toBeDefined();
    expect(marker.renderChunk('console.log("chunk");', { isEntry: false })).toBeNull();
  });

  describe('registrationModule option', () => {
    const REGISTRATION_MODULE = '@sentry/cloudflare/orchestrion';

    function getRegisterPlugin(): AnyPlugin {
      const plugins = sentryOrchestrionPlugin({ registrationModule: REGISTRATION_MODULE });
      const plugin = plugins.find((p: AnyPlugin) => p.name === 'sentry-orchestrion-register-integrations');
      expect(plugin).toBeDefined();
      return plugin;
    }

    it('is not added without the option', () => {
      const names = sentryOrchestrionPlugin().map((p: AnyPlugin) => p.name);
      expect(names).not.toContain('sentry-orchestrion-register-integrations');
    });

    it('appends the registration import to modules importing the SDK package', () => {
      const plugin = getRegisterPlugin();
      const code = "import * as Sentry from '@sentry/cloudflare';\nexport default Sentry.withSentry(() => ({}), {});";
      const result = plugin.transform.call({}, code, '/app/src/index.ts');
      expect(result.code).toContain(`import "${REGISTRATION_MODULE}";`);
      // Original code stays at the top so existing sourcemap lines keep their positions.
      expect(result.code.startsWith(code)).toBe(true);
      expect(result.map).toBeDefined();
    });

    it('matches double-quoted imports', () => {
      const plugin = getRegisterPlugin();
      const result = plugin.transform.call({}, 'import { withSentry } from "@sentry/cloudflare";', '/app/entry.ts');
      expect(result.code).toContain(`import "${REGISTRATION_MODULE}";`);
    });

    it('ignores modules that do not import the SDK package', () => {
      const plugin = getRegisterPlugin();
      expect(plugin.transform.call({}, "import mysql from 'mysql';", '/app/db.ts')).toBeNull();
      // A specifier that merely starts with the package name is a different package.
      expect(plugin.transform.call({}, "import { x } from '@sentry/cloudflare-foo';", '/app/other.ts')).toBeNull();
    });

    it('does not inject twice', () => {
      const plugin = getRegisterPlugin();
      const code = `import * as Sentry from '@sentry/cloudflare';\nimport "${REGISTRATION_MODULE}";`;
      expect(plugin.transform.call({}, code, '/app/src/index.ts')).toBeNull();
    });

    it('skips client environments', () => {
      const plugin = getRegisterPlugin();
      const clientContext = { environment: { config: { consumer: 'client' } } };
      const code = "import * as Sentry from '@sentry/cloudflare';";
      expect(plugin.transform.call(clientContext, code, '/app/src/index.ts')).toBeNull();

      const serverContext = { environment: { config: { consumer: 'server' } } };
      expect(plugin.transform.call(serverContext, code, '/app/src/index.ts')).not.toBeNull();
    });
  });
});
