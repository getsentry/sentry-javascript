/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { onClientEntry } from '../gatsby-browser';
import { BrowserTracing } from '../src/index';

(global as any).__SENTRY_RELEASE__ = '683f3a6ab819d47d23abfca9a914c81f0524d35b';
(global as any).__SENTRY_DSN__ = 'https://examplePublicKey@o0.ingest.sentry.io/0';

let sentryInit = jest.fn();
jest.mock('@sentry/gatsby', () => {
  const original = jest.requireActual('@sentry/gatsby');
  return {
    ...original,
    init: (...args: any[]) => {
      sentryInit(...args);
    },
  };
});
global.console.warn = jest.fn();
global.console.error = jest.fn();

let tracingAddExtensionMethods = jest.fn();
jest.mock('@sentry/core', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    addTracingExtensions: (...args: any[]) => {
      tracingAddExtensionMethods(...args);
    },
  };
});

describe('onClientEntry', () => {
  beforeEach(() => {
    sentryInit = jest.fn();
    tracingAddExtensionMethods = jest.fn();
  });

  it.each([
    [{}, ['dsn']],
    [{ key: 'value' }, ['dsn', 'key']],
  ])('inits Sentry by default', (pluginParams, expectedKeys) => {
    onClientEntry(undefined, pluginParams);
    expect(sentryInit).toHaveBeenCalledTimes(1);
    const calledWith = sentryInit.mock.calls[0][0];
    for (const key of expectedKeys) {
      expect(calledWith[key]).toBeDefined();
    }
  });

  describe('inits Sentry once', () => {
    afterEach(() => {
      delete (window as any).__SENTRY__;
      (global.console.warn as jest.Mock).mockClear();
      (global.console.error as jest.Mock).mockClear();
    });

    function setMockedSentryInWindow() {
      (window as any).__SENTRY__ = {
        hub: {
          getClient: () => ({
            // Empty object mocking the client
          }),
        },
      };
    }

    it('initialized in injected config, without pluginParams', () => {
      setMockedSentryInWindow();
      onClientEntry(undefined, { plugins: [] });
      // eslint-disable-next-line no-console
      expect(console.warn).not.toHaveBeenCalled();
      // eslint-disable-next-line no-console
      expect(console.error).not.toHaveBeenCalled();
      expect(sentryInit).not.toHaveBeenCalled();
    });

    it('initialized in injected config, with pluginParams', () => {
      setMockedSentryInWindow();
      onClientEntry(undefined, { plugins: [], dsn: 'dsn', release: 'release' });
      // eslint-disable-next-line no-console
      expect((console.warn as jest.Mock).mock.calls[0]).toMatchInlineSnapshot(`
        [
          "Sentry Logger [Warn]: The SDK was initialized in the Sentry config file, but options were found in the Gatsby config. These have been ignored. Merge them to the Sentry config if you want to use them.
        Learn more about the Gatsby SDK in https://docs.sentry.io/platforms/javascript/guides/gatsby/.",
        ]
      `);
      // eslint-disable-next-line no-console
      expect(console.error).not.toHaveBeenCalled();
      expect(sentryInit).not.toHaveBeenCalled();
    });

    it('not initialized in injected config, without pluginParams', () => {
      onClientEntry(undefined, { plugins: [] });
      // eslint-disable-next-line no-console
      expect(console.warn).not.toHaveBeenCalled();
      // eslint-disable-next-line no-console
      expect((console.error as jest.Mock).mock.calls[0]).toMatchInlineSnapshot(`
        [
          "Sentry Logger [Error]: No config for the Gatsby SDK was found.
        Learn how to configure it in https://docs.sentry.io/platforms/javascript/guides/gatsby/.",
        ]
      `);
    });

    it('not initialized in injected config, with pluginParams', () => {
      onClientEntry(undefined, { plugins: [], dsn: 'dsn', release: 'release' });
      // eslint-disable-next-line no-console
      expect(console.warn).not.toHaveBeenCalled();
      // eslint-disable-next-line no-console
      expect(console.error).not.toHaveBeenCalled();
      expect(sentryInit).toHaveBeenCalledTimes(1);
      expect(sentryInit.mock.calls[0][0]).toMatchInlineSnapshot(`
              {
                "dsn": "dsn",
                "plugins": [],
                "release": "release",
              }
            `);
    });
  });

  it('sets a tracesSampleRate if defined as option', () => {
    onClientEntry(undefined, { tracesSampleRate: 0.5 });
    expect(sentryInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tracesSampleRate: 0.5,
      }),
    );
  });

  it('sets a tracesSampler if defined as option', () => {
    const tracesSampler = jest.fn();
    onClientEntry(undefined, { tracesSampler });
    expect(sentryInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tracesSampler,
      }),
    );
  });

  it('only defines a single `BrowserTracing` integration', () => {
    const integrations = [new BrowserTracing()];
    onClientEntry(undefined, { tracesSampleRate: 0.5, integrations });

    expect(sentryInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        integrations: [expect.objectContaining({ name: 'BrowserTracing' })],
      }),
    );
  });

  // Run this last to check for any test side effects
  it('does not run if plugin params are undefined', () => {
    onClientEntry(undefined, undefined);
    expect(sentryInit).toHaveBeenCalledTimes(0);
    expect(tracingAddExtensionMethods).toHaveBeenCalledTimes(0);
  });
});
