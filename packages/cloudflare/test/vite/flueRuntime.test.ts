import { describe, expect, it, vi } from 'vitest';
import { sentryFlueRuntimeProviderPlugin } from '../../src/vite/flueRuntime';
import { sentryCloudflareVitePlugin } from '../../src/vite/index';

const PROVIDER_PLUGIN = 'sentry-cloudflare-flue-runtime-provider';
const FLUE_INTEGRATION_MODULE = '/app/node_modules/@sentry/server-utils/build/esm/integrations/flue.js';

describe('sentryFlueRuntimeProviderPlugin', () => {
  it('injects `@flue/runtime` behind a getter', async () => {
    // A getter, not an assignment: the bundler may evaluate Sentry's module before
    // `@flue/runtime` is initialized, and assigning there would store `undefined`.
    const plugin = sentryFlueRuntimeProviderPlugin();
    plugin.configResolved({ root: '/app' });
    const resolve = vi.fn(async () => ({ id: '/app/node_modules/@flue/runtime/dist/index.mjs' }));
    await plugin.buildStart.call({ resolve, warn: vi.fn() });

    const code = plugin.transform('export const x = 1;', FLUE_INTEGRATION_MODULE)?.code;

    expect(resolve).toHaveBeenCalledWith('@flue/runtime', '/app/noop.js');
    expect(code).toContain("import * as __SENTRY_FLUE_RUNTIME__ from '@flue/runtime';");
    expect(code).toContain('get() { return __SENTRY_FLUE_RUNTIME__; }');
  });

  it('injects nothing when the app has no @flue/runtime', async () => {
    const plugin = sentryFlueRuntimeProviderPlugin();
    plugin.configResolved({ root: '/app' });
    await plugin.buildStart.call({ resolve: vi.fn(async () => null), warn: vi.fn() });

    expect(plugin.transform('export const x = 1;', FLUE_INTEGRATION_MODULE)).toBeUndefined();
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
