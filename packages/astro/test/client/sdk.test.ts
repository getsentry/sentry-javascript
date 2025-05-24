import {
  BrowserClient,
  browserTracingIntegration,
  getActiveSpan,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  SDK_VERSION,
} from '@sentry/browser';
import * as SentryBrowser from '@sentry/browser';
import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/client/sdk';

const initAndBind = vi.spyOn(SentryCore, 'initAndBind');

// Mock this to avoid the "duplicate integration" error message
vi.spyOn(SentryBrowser, 'browserTracingIntegration').mockImplementation(() => {
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

      getCurrentScope().clear();
      getCurrentScope().setClient(undefined);
      getIsolationScope().clear();
      getGlobalScope().clear();
    });

    it('adds Astro metadata to the SDK options', () => {
      expect(initAndBind).not.toHaveBeenCalled();

      init({});

      expect(initAndBind).toHaveBeenCalledTimes(1);
      expect(initAndBind).toHaveBeenCalledWith(
        BrowserClient,
        expect.objectContaining({
          _metadata: {
            sdk: {
              name: 'sentry.javascript.astro',
              version: SDK_VERSION,
              packages: [
                { name: 'npm:@sentry/astro', version: SDK_VERSION },
                { name: 'npm:@sentry/browser', version: SDK_VERSION },
              ],
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
        const client = init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          ...tracingOptions,
        });

        const browserTracing = client?.getIntegrationByName('BrowserTracing');
        expect(browserTracing).toBeDefined();
      });

      it("doesn't add browserTracingIntegration if `__SENTRY_TRACING__` is set to false", () => {
        (globalThis as any).__SENTRY_TRACING__ = false;

        const client = init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          tracesSampleRate: 1,
        });

        const browserTracing = client?.getIntegrationByName('BrowserTracing');
        expect(browserTracing).toBeUndefined();

        delete (globalThis as any).__SENTRY_TRACING__;
      });

      it('Overrides the automatically default browserTracingIntegration instance with a a user-provided browserTracingIntegration instance', () => {
        const client = init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          integrations: [
            browserTracingIntegration({ finalTimeout: 10, instrumentNavigation: false, instrumentPageLoad: false }),
          ],
          tracesSampleRate: 1,
        });

        const browserTracing = client?.getIntegrationByName('BrowserTracing');
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
