import type { BrowserClient } from '@sentry/svelte';
import * as SentrySvelte from '@sentry/svelte';
import { getClient, getCurrentScope, getGlobalScope, getIsolationScope, SDK_VERSION } from '@sentry/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/client';

const svelteInit = vi.spyOn(SentrySvelte, 'init');

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
      expect(svelteInit).not.toHaveBeenCalled();

      init({});

      expect(svelteInit).toHaveBeenCalledTimes(1);
      expect(svelteInit).toHaveBeenCalledWith(
        expect.objectContaining({
          _metadata: {
            sdk: {
              name: 'sentry.javascript.sveltekit',
              version: SDK_VERSION,
              packages: [
                { name: 'npm:@sentry/sveltekit', version: SDK_VERSION },
                { name: 'npm:@sentry/svelte', version: SDK_VERSION },
              ],
              settings: {
                infer_ip: 'never',
              },
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
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          ...tracingOptions,
        });

        const browserTracing = getClient<BrowserClient>()?.getIntegrationByName('BrowserTracing');
        expect(browserTracing).toBeDefined();
      });

      it("doesn't add a browserTracingIntegration if `__SENTRY_TRACING__` is set to false", () => {
        // This is the closest we can get to unit-testing the `__SENTRY_TRACING__` tree-shaking guard
        // IRL, the code to add the integration would most likely be removed by the bundler.

        globalThis.__SENTRY_TRACING__ = false;

        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          tracesSampleRate: 1,
        });

        const browserTracing = getClient<BrowserClient>()?.getIntegrationByName('BrowserTracing');
        expect(browserTracing).toBeUndefined();

        delete globalThis.__SENTRY_TRACING__;
      });
    });

    it('returns client from init', () => {
      expect(init({})).not.toBeUndefined();
    });
  });
});
