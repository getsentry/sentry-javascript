import { describe, expect, it, vi } from 'vitest';
import { sentryCloudflareVitePlugin } from '../../src/vite/index';
import { sentryMastraObservabilityProviderPlugin } from '../../src/vite/mastraObservability';

const PROVIDER_PLUGIN = 'sentry-cloudflare-mastra-observability-provider';

describe('sentryMastraObservabilityProviderPlugin', () => {
  const MASTRA_INTEGRATION_MODULE = '/app/node_modules/@sentry/server-utils/build/esm/integrations/mastra.js';

  it('exposes `@mastra/observability` on the marker behind a getter', async () => {
    const plugin = sentryMastraObservabilityProviderPlugin();
    plugin.configResolved({ root: '/app' });
    const resolve = vi.fn(async () => ({ id: '/app/node_modules/@mastra/observability/dist/index.js' }));
    await plugin.buildStart.call({ resolve, warn: vi.fn() });

    const code = plugin.transform('export const x = 1;', MASTRA_INTEGRATION_MODULE)?.code;

    expect(resolve).toHaveBeenCalledWith('@mastra/observability', '/app/noop.js');
    expect(code).toContain("import * as __SENTRY_MASTRA_OBSERVABILITY__ from '@mastra/observability';");
    expect(code).toContain('get() { return __SENTRY_MASTRA_OBSERVABILITY__; }');
  });

  it('injects nothing when the app has no @mastra/observability', async () => {
    const plugin = sentryMastraObservabilityProviderPlugin();
    plugin.configResolved({ root: '/app' });
    await plugin.buildStart.call({ resolve: vi.fn(async () => null), warn: vi.fn() });

    expect(plugin.transform('export const x = 1;', MASTRA_INTEGRATION_MODULE)).toBeUndefined();
  });

  it('keeps injecting for an ESM-only release', async () => {
    // The old `createRequire().resolve()` probe read an ESM-only package as missing, because it
    // has no `require` condition. `this.resolve()` uses the environment's own conditions.
    const plugin = sentryMastraObservabilityProviderPlugin();
    plugin.configResolved({ root: '/app' });
    await plugin.buildStart.call({
      resolve: vi.fn(async () => ({ id: '/app/node_modules/@mastra/observability/dist/index.js' })),
      warn: vi.fn(),
    });

    expect(plugin.transform('', MASTRA_INTEGRATION_MODULE)).toBeDefined();
  });
});

describe('sentryCloudflareVitePlugin', () => {
  it('always includes the Mastra observability provider plugin', () => {
    expect(sentryCloudflareVitePlugin().map(plugin => plugin.name)).toContain(PROVIDER_PLUGIN);
    // Not gated by auto-instrumentation: it injects into Sentry's own module, not the entry.
    expect(sentryCloudflareVitePlugin({ autoInstrumentation: false }).map(plugin => plugin.name)).toContain(
      PROVIDER_PLUGIN,
    );
  });
});
