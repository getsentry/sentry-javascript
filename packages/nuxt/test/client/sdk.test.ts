import * as SentryBrowser from '@sentry/browser';
import { type BrowserClient, SDK_VERSION, getClient } from '@sentry/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/client';

const browserInit = vi.spyOn(SentryBrowser, 'init');

describe('Nuxt Client SDK', () => {
  describe('init', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('Adds Nuxt metadata to the SDK options', () => {
      expect(browserInit).not.toHaveBeenCalled();

      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      });

      const expectedMetadata = {
        _metadata: {
          sdk: {
            name: 'sentry.javascript.nuxt',
            version: SDK_VERSION,
            packages: [
              { name: 'npm:@sentry/nuxt', version: SDK_VERSION },
              { name: 'npm:@sentry/vue', version: SDK_VERSION },
            ],
          },
        },
      };

      expect(browserInit).toHaveBeenCalledTimes(1);
      expect(browserInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
    });

    describe('Automatically adds BrowserTracing integration', () => {
      it.each([
        ['tracesSampleRate', { tracesSampleRate: 0 }],
        ['tracesSampler', { tracesSampler: () => 1.0 }],
        ['enableTracing', { enableTracing: true }],
        ['no tracing option set', {}] /* enable "tracing without performance" by default */,
      ])('adds a browserTracingIntegration if tracing is enabled via %s', (_, tracingOptions) => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          ...tracingOptions,
        });

        const browserTracing = getClient<BrowserClient>()?.getIntegrationByName('BrowserTracing');
        expect(browserTracing).toBeDefined();
      });
    });

    it('returns client from init', () => {
      expect(init({})).not.toBeUndefined();
    });
  });
});
