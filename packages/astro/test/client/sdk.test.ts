import type { BrowserClient } from '@sentry/browser';
import * as SentryBrowser from '@sentry/browser';
import { BrowserTracing, getCurrentHub, SDK_VERSION, WINDOW } from '@sentry/browser';
import { vi } from 'vitest';

import { init } from '../../../astro/src/client/sdk';

const browserInit = vi.spyOn(SentryBrowser, 'init');

describe('Sentry client SDK', () => {
  describe('init', () => {
    afterEach(() => {
      vi.clearAllMocks();
      WINDOW.__SENTRY__.hub = undefined;
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

    it('sets the runtime tag on the scope', () => {
      const currentScope = getCurrentHub().getScope();

      // @ts-expect-error need access to protected _tags attribute
      expect(currentScope._tags).toEqual({});

      init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      // @ts-expect-error need access to protected _tags attribute
      expect(currentScope._tags).toEqual({ runtime: 'browser' });
    });

    describe('automatically adds integrations', () => {
      it.each([
        ['tracesSampleRate', { tracesSampleRate: 0 }],
        ['tracesSampler', { tracesSampler: () => 1.0 }],
        ['enableTracing', { enableTracing: true }],
      ])('adds the BrowserTracing integration if tracing is enabled via %s', (_, tracingOptions) => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          ...tracingOptions,
        });

        const integrationsToInit = browserInit.mock.calls[0][0]?.integrations;
        const browserTracing = (getCurrentHub().getClient() as BrowserClient)?.getIntegrationById('BrowserTracing');

        expect(integrationsToInit).toContainEqual(expect.objectContaining({ name: 'BrowserTracing' }));
        expect(browserTracing).toBeDefined();
      });

      it.each([
        ['enableTracing', { enableTracing: false }],
        ['no tracing option set', {}],
      ])("doesn't add the BrowserTracing integration if tracing is disabled via %s", (_, tracingOptions) => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          ...tracingOptions,
        });

        const integrationsToInit = browserInit.mock.calls[0][0]?.integrations;
        const browserTracing = (getCurrentHub().getClient() as BrowserClient)?.getIntegrationById('BrowserTracing');

        expect(integrationsToInit).not.toContainEqual(expect.objectContaining({ name: 'BrowserTracing' }));
        expect(browserTracing).toBeUndefined();
      });

      it("doesn't add the BrowserTracing integration if `__SENTRY_TRACING__` is set to false", () => {
        globalThis.__SENTRY_TRACING__ = false;

        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          enableTracing: true,
        });

        const integrationsToInit = browserInit.mock.calls[0][0]?.integrations;
        const browserTracing = (getCurrentHub().getClient() as BrowserClient)?.getIntegrationById('BrowserTracing');

        expect(integrationsToInit).not.toContainEqual(expect.objectContaining({ name: 'BrowserTracing' }));
        expect(browserTracing).toBeUndefined();

        delete globalThis.__SENTRY_TRACING__;
      });

      it('Overrides the automatically default BrowserTracing instance with a a user-provided instance', () => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          integrations: [new BrowserTracing({ finalTimeout: 10, startTransactionOnLocationChange: false })],
          enableTracing: true,
        });

        const integrationsToInit = browserInit.mock.calls[0][0]?.integrations;

        const browserTracing = (getCurrentHub().getClient() as BrowserClient)?.getIntegrationById(
          'BrowserTracing',
        ) as BrowserTracing;
        const options = browserTracing.options;

        expect(integrationsToInit).toContainEqual(expect.objectContaining({ name: 'BrowserTracing' }));
        expect(browserTracing).toBeDefined();

        // This shows that the user-configured options are still here
        expect(options.finalTimeout).toEqual(10);
      });
    });
  });
});
