import { describe, expect, it } from 'vitest';
import { makeModuleSyncTracingPlugin } from '../../src/vite/moduleSyncTracing';

describe('makeModuleSyncTracingPlugin', () => {
  it('injects moduleSyncCatchall for the Nitro vite plugin via a pre-ordered config hook', () => {
    const plugin = makeModuleSyncTracingPlugin();

    expect(plugin.name).toBe('sentry-tanstackstart-react-module-sync-tracing');

    // Must run before the Nitro plugin's plain-ordered `config` hook, which reads the `nitro` key.
    const configHook = plugin.config as { order?: string; handler: () => unknown };
    expect(configHook.order).toBe('pre');

    expect(configHook.handler()).toEqual({
      nitro: {
        externals: {
          trace: {
            nft: {
              moduleSyncCatchall: true,
            },
          },
        },
      },
    });
  });
});
