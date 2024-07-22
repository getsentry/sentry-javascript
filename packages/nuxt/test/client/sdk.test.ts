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
      ])('adds a browserTracingIntegration if tracing is enabled via %s', (_, tracingOptions) => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          ...tracingOptions,
        });

        const browserTracing = getClient<BrowserClient>()?.getIntegrationByName('BrowserTracing');
        expect(browserTracing).toBeDefined();
      });

      it.each([
        ['enableTracing', { enableTracing: false }],
        ['no tracing option set', {}],
      ])("doesn't add a browserTracingIntegration integration if tracing is disabled via %s", (_, tracingOptions) => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          ...tracingOptions,
        });

        const browserTracing = getClient<BrowserClient>()?.getIntegrationByName('BrowserTracing');
        expect(browserTracing).toBeUndefined();
      });

      it("doesn't add a browserTracingIntegration if `__SENTRY_TRACING__` is set to false", () => {
        // This is the closest we can get to unit-testing the `__SENTRY_TRACING__` tree-shaking guard
        // IRL, the code to add the integration would most likely be removed by the bundler.

        // @ts-expect-error: Testing purposes
        globalThis.__SENTRY_TRACING__ = false;

        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          tracesSampleRate: 0.3,
        });

        const browserTracing = getClient<BrowserClient>()?.getIntegrationByName('BrowserTracing');
        expect(browserTracing).toBeUndefined();

        // @ts-expect-error: Testing purposes
        delete globalThis.__SENTRY_TRACING__;
      });
    });

    it('returns client from init', () => {
      expect(init({})).not.toBeUndefined();
    });
  });
});
