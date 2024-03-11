import type { BrowserClient } from '@sentry/browser';
import {
  browserTracingIntegration,
  getActiveSpan,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
} from '@sentry/browser';
import * as SentryBrowser from '@sentry/browser';
import { SDK_VERSION, getClient } from '@sentry/browser';
import { vi } from 'vitest';

import { init } from '../../../astro/src/client/sdk';

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
            },
          },
        }),
      );
    });

    it('sets the runtime tag on the isolation scope', () => {
      expect(getIsolationScope().getScopeData().tags).toEqual({});

      init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(getIsolationScope().getScopeData().tags).toEqual({ runtime: 'browser' });
    });

    describe('automatically adds integrations', () => {
      it.each([
        ['tracesSampleRate', { tracesSampleRate: 0 }],
        ['tracesSampler', { tracesSampler: () => 1.0 }],
        ['enableTracing', { enableTracing: true }],
      ])('adds browserTracingIntegration if tracing is enabled via %s', (_, tracingOptions) => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          ...tracingOptions,
        });

        const integrationsToInit = browserInit.mock.calls[0][0]?.defaultIntegrations;
        const browserTracing = getClient<BrowserClient>()?.getIntegrationByName('BrowserTracing');

        expect(integrationsToInit).toContainEqual(expect.objectContaining({ name: 'BrowserTracing' }));
        expect(browserTracing).toBeDefined();
      });

      it.each([
        ['enableTracing', { enableTracing: false }],
        ['no tracing option set', {}],
      ])("doesn't add browserTracingIntegration if tracing is disabled via %s", (_, tracingOptions) => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          ...tracingOptions,
        });

        const integrationsToInit = browserInit.mock.calls[0][0]?.defaultIntegrations || [];
        const browserTracing = getClient<BrowserClient>()?.getIntegrationByName('BrowserTracing');

        expect(integrationsToInit).not.toContainEqual(expect.objectContaining({ name: 'BrowserTracing' }));
        expect(browserTracing).toBeUndefined();
      });

      it("doesn't add browserTracingIntegration if `__SENTRY_TRACING__` is set to false", () => {
        globalThis.__SENTRY_TRACING__ = false;

        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          enableTracing: true,
        });

        const integrationsToInit = browserInit.mock.calls[0][0]?.defaultIntegrations || [];
        const browserTracing = getClient<BrowserClient>()?.getIntegrationByName('BrowserTracing');

        expect(integrationsToInit).not.toContainEqual(expect.objectContaining({ name: 'BrowserTracing' }));
        expect(browserTracing).toBeUndefined();

        delete globalThis.__SENTRY_TRACING__;
      });

      it('Overrides the automatically default browserTracingIntegration instance with a a user-provided browserTracingIntegration instance', () => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          integrations: [
            browserTracingIntegration({ finalTimeout: 10, instrumentNavigation: false, instrumentPageLoad: false }),
          ],
          enableTracing: true,
        });

        const browserTracing = getClient<BrowserClient>()?.getIntegrationByName('BrowserTracing');
        expect(browserTracing).toBeDefined();

        // no active span means the settings were respected
        expect(getActiveSpan()).toBeUndefined();
      });
    });
  });
});
