import type { BrowserClient } from '@sentry/browser';
import {
  browserTracingIntegration,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  SDK_VERSION,
} from '@sentry/browser';
import * as SentryBrowser from '@sentry/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/client/sdk';

const browserInit = vi.spyOn(SentryBrowser, 'init');

describe('Sentry client SDK', () => {
  describe('init', () => {
    afterEach(() => {
      vi.clearAllMocks();

      getCurrentScope().clear();
      getCurrentScope().setClient(undefined);
      getIsolationScope().clear();
      getGlobalScope().clear();
    });

    it('adds Astro metadata to the SDK options', () => {
      expect(browserInit).not.toHaveBeenCalled();

      init({});

      expect(browserInit).toHaveBeenCalledTimes(1);
      expect(browserInit).toHaveBeenCalledWith(
        expect.objectContaining({
          _metadata: {
            sdk: {
              name: 'sentry.javascript.astro',
              version: SDK_VERSION,
              packages: [
                { name: 'npm:@sentry/astro', version: SDK_VERSION },
                { name: 'npm:@sentry/browser', version: SDK_VERSION },
              ],
              settings: {
                infer_ip: 'never',
              },
            },
          },
        }),
      );
    });

    describe('automatically adds integrations', () => {
      it.each([
        ['tracesSampleRate', { tracesSampleRate: 0 }],
        ['tracesSampler', { tracesSampler: () => 1.0 }],
        ['no tracing option set', {}],
      ])('adds browserTracingIntegration if tracing is enabled via %s', (_, tracingOptions) => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          ...tracingOptions,
        });

        const integrationsToInit = browserInit.mock.calls[0]![0]?.defaultIntegrations;
        const browserTracing = getClient<BrowserClient>()?.getIntegrationByName('BrowserTracing');

        expect(integrationsToInit).toContainEqual(expect.objectContaining({ name: 'BrowserTracing' }));
        expect(browserTracing).toBeDefined();
      });

      it("doesn't add browserTracingIntegration if `__SENTRY_TRACING__` is set to false", () => {
        (globalThis as any).__SENTRY_TRACING__ = false;

        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          tracesSampleRate: 1,
        });

        const integrationsToInit = browserInit.mock.calls[0]![0]?.defaultIntegrations || [];
        const browserTracing = getClient<BrowserClient>()?.getIntegrationByName('BrowserTracing');

        expect(integrationsToInit).not.toContainEqual(expect.objectContaining({ name: 'BrowserTracing' }));
        expect(browserTracing).toBeUndefined();

        delete (globalThis as any).__SENTRY_TRACING__;
      });

      it('Overrides the automatically default browserTracingIntegration instance with a a user-provided browserTracingIntegration instance', () => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          integrations: [
            browserTracingIntegration({ finalTimeout: 10, instrumentNavigation: false, instrumentPageLoad: false }),
          ],
          tracesSampleRate: 1,
        });

        const browserTracing = getClient<BrowserClient>()?.getIntegrationByName('BrowserTracing');
        expect(browserTracing).toBeDefined();

        // no active span means the settings were respected
        expect(getActiveSpan()).toBeUndefined();
      });
    });

    it('returns client from init', () => {
      expect(init({})).not.toBeUndefined();
    });
  });
});
