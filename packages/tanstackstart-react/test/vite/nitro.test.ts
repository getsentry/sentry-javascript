import { describe, expect, it } from 'vitest';
import { makeNitroSentryExternalPlugin } from '../../src/vite/nitro';

describe('makeNitroSentryExternalPlugin()', () => {
  it('returns nitro config to externalize @sentry/* packages', () => {
    const plugin = makeNitroSentryExternalPlugin();
    const config = (plugin.config as () => unknown)();

    expect(config).toEqual({
      nitro: {
        rollupConfig: {
          external: [/^@sentry\//],
        },
      },
    });
  });
});
