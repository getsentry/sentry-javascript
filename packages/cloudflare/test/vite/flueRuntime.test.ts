import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { sentryCloudflareVitePlugin } from '../../src/vite/index';
import { isFlueIntegrationModuleId, sentryFlueRuntimeProviderPlugin } from '../../src/vite/flueRuntime';

const PROVIDER_PLUGIN = 'sentry-cloudflare-flue-runtime-provider';
const FLUE_INTEGRATION_MODULE = '/app/node_modules/@sentry/server-utils/build/esm/integrations/flue.js';

/** An app root whose `node_modules` holds an ESM-only `@flue/runtime`, as published. */
function createRootWithFlue(): string {
  const root = mkdtempSync(join(tmpdir(), 'sentry-flue-root-'));
  const pkgDir = join(root, 'node_modules', '@flue', 'runtime');
  mkdirSync(join(pkgDir, 'dist'), { recursive: true });
  writeFileSync(
    join(pkgDir, 'package.json'),
    // No `require` condition — the reason `resolve()` reports ERR_PACKAGE_PATH_NOT_EXPORTED.
    JSON.stringify({
      name: '@flue/runtime',
      version: '2.0.8',
      type: 'module',
      exports: { '.': { import: './dist/index.mjs' } },
    }),
  );
  writeFileSync(join(pkgDir, 'dist', 'index.mjs'), 'export const instrument = () => {};\n');
  return root;
}

function createEmptyRoot(): string {
  return mkdtempSync(join(tmpdir(), 'sentry-flue-empty-'));
}

describe('isFlueIntegrationModuleId', () => {
  it('matches the ESM Flue integration module', () => {
    expect(isFlueIntegrationModuleId(FLUE_INTEGRATION_MODULE)).toBe(true);
  });

  it('ignores a trailing query/hash Vite may append', () => {
    expect(isFlueIntegrationModuleId(`${FLUE_INTEGRATION_MODULE}?v=abc`)).toBe(true);
  });

  it('normalizes Windows separators', () => {
    expect(
      isFlueIntegrationModuleId('C:\\app\\node_modules\\@sentry\\server-utils\\build\\esm\\integrations\\flue.js'),
    ).toBe(true);
  });

  it('does not match the CJS build (workers load ESM)', () => {
    expect(isFlueIntegrationModuleId('/app/node_modules/@sentry/server-utils/build/cjs/integrations/flue.js')).toBe(
      false,
    );
  });

  it('does not match another integration module', () => {
    expect(isFlueIntegrationModuleId('/app/node_modules/@sentry/server-utils/build/esm/integrations/mastra.js')).toBe(
      false,
    );
  });

  it('does not match Flue itself', () => {
    expect(isFlueIntegrationModuleId('/app/node_modules/@flue/runtime/dist/index.mjs')).toBe(false);
  });
});

describe('sentryFlueRuntimeProviderPlugin', () => {
  describe('when the app has @flue/runtime installed', () => {
    let root: string;

    beforeAll(() => {
      root = createRootWithFlue();
    });

    it('injects the provider even though the package is ESM-only', () => {
      // Regression guard: treating that error as "absent" silently disabled auto-instrumentation.
      const plugin = sentryFlueRuntimeProviderPlugin();
      plugin.configResolved({ root });

      const result = plugin.transform('export const x = 1;', FLUE_INTEGRATION_MODULE);

      expect(result?.code).toContain("import * as __SENTRY_FLUE_RUNTIME__ from '@flue/runtime';");
      expect(result?.code).toContain('__SENTRY_ORCHESTRION__.providedModules');
      expect(result?.code).toContain('export const x = 1;');
    });

    it('exposes the namespace through a getter rather than a snapshot', () => {
      const plugin = sentryFlueRuntimeProviderPlugin();
      plugin.configResolved({ root });

      expect(plugin.transform('', FLUE_INTEGRATION_MODULE)?.code).toContain(
        'get() { return __SENTRY_FLUE_RUNTIME__; }',
      );
    });

    it('leaves every other module untouched', () => {
      const plugin = sentryFlueRuntimeProviderPlugin();
      plugin.configResolved({ root });

      expect(plugin.transform('export const x = 1;', '/app/src/index.ts')).toBeUndefined();
    });
  });

  describe('when the app does not have @flue/runtime installed', () => {
    it('injects nothing', () => {
      const plugin = sentryFlueRuntimeProviderPlugin();
      plugin.configResolved({ root: createEmptyRoot() });

      expect(plugin.transform('export const x = 1;', FLUE_INTEGRATION_MODULE)).toBeUndefined();
    });

    it("resolves from the app root, not from Sentry's own install", () => {
      // This repo has no `@flue/runtime`, so only an app root that does can pass the check.
      const withFlue = sentryFlueRuntimeProviderPlugin();
      withFlue.configResolved({ root: createRootWithFlue() });

      const withoutFlue = sentryFlueRuntimeProviderPlugin();
      withoutFlue.configResolved({ root: createEmptyRoot() });

      expect(withFlue.transform('', FLUE_INTEGRATION_MODULE)).toBeDefined();
      expect(withoutFlue.transform('', FLUE_INTEGRATION_MODULE)).toBeUndefined();
    });
  });
});

describe('sentryCloudflareVitePlugin', () => {
  it('always includes the Flue runtime provider plugin', () => {
    expect(sentryCloudflareVitePlugin().map(plugin => plugin.name)).toContain(PROVIDER_PLUGIN);
    // Not gated by auto-instrumentation: it injects into Sentry's own module, not the entry.
    expect(sentryCloudflareVitePlugin({ autoInstrumentation: false }).map(plugin => plugin.name)).toContain(
      PROVIDER_PLUGIN,
    );
  });
});
