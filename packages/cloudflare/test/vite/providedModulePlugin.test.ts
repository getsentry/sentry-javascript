import { describe, expect, it, vi } from 'vitest';
import type { ProvidedModulePluginOptions } from '../../src/vite/providedModulePlugin';
import { createIntegrationModuleMatcher, createProvidedModulePlugin } from '../../src/vite/providedModulePlugin';

const TARGET = '/app/node_modules/@sentry/server-utils/build/esm/integrations/flue.js';

const OPTIONS: ProvidedModulePluginOptions = {
  name: 'sentry-test-provider',
  moduleName: '@scope/pkg',
  identifier: '__SENTRY_TEST_PKG__',
  integrationModule: 'flue',
};

/** A Rollup plugin context whose `resolve` answers however the test wants. */
function pluginContext(resolve: (source: string, importer?: string) => unknown): {
  resolve: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
} {
  return {
    resolve: vi.fn(async (source: string, importer?: string) => resolve(source, importer)),
    warn: vi.fn(),
  };
}

const found = pluginContext(() => ({ id: '/app/node_modules/@scope/pkg/dist/index.mjs' }));
const missing = pluginContext(() => null);

/** Run `configResolved` + `buildStart` the way Vite would, then hand the plugin back. */
async function start(
  options: Partial<ProvidedModulePluginOptions>,
  context: ReturnType<typeof pluginContext>,
  root = '/app',
): Promise<ReturnType<typeof createProvidedModulePlugin>> {
  const plugin = createProvidedModulePlugin({ ...OPTIONS, ...options });
  plugin.configResolved({ root });
  await plugin.buildStart.call(context);
  return plugin;
}

describe('createIntegrationModuleMatcher', () => {
  const isFlueIntegrationModuleId = createIntegrationModuleMatcher('flue');

  it('matches the ESM integration module', () => {
    expect(isFlueIntegrationModuleId(TARGET)).toBe(true);
  });

  it('ignores a trailing query/hash Vite may append', () => {
    expect(isFlueIntegrationModuleId(`${TARGET}?v=abc`)).toBe(true);
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

  it('does not match the instrumented package itself', () => {
    expect(isFlueIntegrationModuleId('/app/node_modules/@flue/runtime/dist/index.mjs')).toBe(false);
    expect(createIntegrationModuleMatcher('mastra')('/app/node_modules/@mastra/core/dist/index.js')).toBe(false);
  });
});

describe('createProvidedModulePlugin', () => {
  it('injects the import and the marker when the package resolves', async () => {
    const plugin = await start(
      {},
      pluginContext(() => ({ id: '/x' })),
    );

    const result = plugin.transform('export const x = 1;', TARGET);

    expect(result?.code).toContain("import * as __SENTRY_TEST_PKG__ from '@scope/pkg';");
    expect(result?.code).toContain('__SENTRY_ORCHESTRION__.providedModules');
    expect(result?.code).toContain('export const x = 1;');
  });

  it('runs in server environments only', () => {
    // `buildStart` runs per environment against one shared instance. A `client` build resolves
    // under browser conditions, so letting it probe answers on the worker's behalf.
    const plugin = createProvidedModulePlugin(OPTIONS);

    expect(plugin.applyToEnvironment({ config: { consumer: 'server' } })).toBe(true);
    expect(plugin.applyToEnvironment({ config: { consumer: 'client' } })).toBe(false);
  });

  it('injects nothing when the package does not resolve', async () => {
    const plugin = await start({}, missing);

    expect(plugin.transform('export const x = 1;', TARGET)).toBeUndefined();
  });

  it('still injects when resolution throws, and reports the cause', async () => {
    // Skipping on a resolver error is how an installed package silently loses instrumentation.
    // The import error Vite raises next says nothing about why resolution broke, so warn with it.
    const context = pluginContext(() => {
      throw new Error('invalid package.json');
    });
    const plugin = await start({}, context);

    expect(plugin.transform('', TARGET)).toBeDefined();
    expect(context.warn).toHaveBeenCalledWith(expect.stringContaining('invalid package.json'));
  });

  it('probes the package from the app root', async () => {
    const context = pluginContext(() => ({ id: '/x' }));
    await start({}, context, '/srv/my-worker');

    expect(context.resolve).toHaveBeenCalledWith('@scope/pkg', '/srv/my-worker/noop.js');
  });

  it('exposes the namespace through an enumerable getter, never an assignment', async () => {
    // Assignment reads the binding at injection time, so it stores `undefined` whenever the
    // bundler evaluates Sentry's module first.
    const plugin = await start({}, found);

    const code = plugin.transform('', TARGET)?.code;

    expect(code).toContain('enumerable: true');
    expect(code).toContain('get() { return __SENTRY_TEST_PKG__; }');
    expect(code).not.toContain("providedModules['@scope/pkg'] =");
  });

  it('leaves every other module untouched', async () => {
    const plugin = await start({}, found);

    expect(plugin.transform('export const x = 1;', '/app/src/index.ts')).toBeUndefined();
  });

  it('injects once, so a second pass cannot emit a duplicate binding', async () => {
    const plugin = await start({}, found);

    const once = plugin.transform('export const x = 1;', TARGET)?.code ?? '';

    expect(plugin.transform(once, TARGET)).toBeUndefined();
  });

  it('stops probing once the package is found', async () => {
    // Vite runs `buildStart` per environment against a shared plugin instance.
    const context = pluginContext(() => ({ id: '/x' }));
    const plugin = await start({}, context);
    await plugin.buildStart.call(context);

    expect(context.resolve).toHaveBeenCalledTimes(1);
  });

  it('probes again in the next environment when the first cannot resolve', async () => {
    // Only the worker environment resolves the worker's dependencies, and it may not run first.
    let resolvable = false;
    const context = pluginContext(() => (resolvable ? { id: '/x' } : null));
    const plugin = await start({}, context);

    resolvable = true;
    await plugin.buildStart.call(context);

    expect(context.resolve).toHaveBeenCalledTimes(2);
    expect(plugin.transform('', TARGET)).toBeDefined();
  });
});
