import * as SentryCore from '@sentry/core';
import * as SentrySvelte from '@sentry/svelte';
import { BrowserClient,getCurrentScope, getGlobalScope, getIsolationScope, SDK_VERSION } from '@sentry/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/client';

const initAndBind = vi.spyOn(SentryCore, 'initAndBind');

// Mock this to avoid the "duplicate integration" error message
vi.spyOn(SentrySvelte, 'browserTracingIntegration').mockImplementation(() => {
  return {
    name: 'BrowserTracing',
    setupOnce: vi.fn(),
    afterAllSetup: vi.fn(),
  };
});

describe('Sentry client SDK', () => {
  describe('init', () => {
    afterEach(() => {
      vi.clearAllMocks();

      getGlobalScope().clear();
      getIsolationScope().clear();
      getCurrentScope().clear();
      getCurrentScope().setClient(undefined);
    });

    it('adds SvelteKit metadata to the SDK options', () => {
      expect(initAndBind).not.toHaveBeenCalled();

      init({});

      expect(initAndBind).toHaveBeenCalledTimes(1);
      expect(initAndBind).toHaveBeenCalledWith(
        BrowserClient,
        expect.objectContaining({
          _metadata: {
            sdk: {
              name: 'sentry.javascript.sveltekit',
              version: SDK_VERSION,
              packages: [
                { name: 'npm:@sentry/sveltekit', version: SDK_VERSION },
                { name: 'npm:@sentry/svelte', version: SDK_VERSION },
              ],
            },
          },
        }),
      );
    });

    describe('automatically added integrations', () => {
      it.each([
        ['tracesSampleRate', { tracesSampleRate: 0 }],
        ['tracesSampler', { tracesSampler: () => 1.0 }],
        ['no tracing option set', {}],
      ])('adds a browserTracingIntegration if tracing is enabled via %s', (_, tracingOptions) => {
        const client = init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          ...tracingOptions,
        });

        const browserTracing = client?.getIntegrationByName('BrowserTracing');
        expect(browserTracing).toBeDefined();
      });

      it("doesn't add a browserTracingIntegration if `__SENTRY_TRACING__` is set to false", () => {
        // This is the closest we can get to unit-testing the `__SENTRY_TRACING__` tree-shaking guard
        // IRL, the code to add the integration would most likely be removed by the bundler.

        globalThis.__SENTRY_TRACING__ = false;

        const client = init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          tracesSampleRate: 1,
        });

        const browserTracing = client?.getIntegrationByName('BrowserTracing');
        expect(browserTracing).toBeUndefined();

        delete globalThis.__SENTRY_TRACING__;
      });
    });

    it('returns client from init', () => {
      expect(init({})).not.toBeUndefined();
    });
  });
});
