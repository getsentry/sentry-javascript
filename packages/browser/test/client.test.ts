/**
 * @vitest-environment jsdom
 */

import { getRouteProvider, resolveCurrentRoute, setRouteProvider } from '@sentry/browser-utils';
import * as SentryCore from '@sentry/core';
import { debug, getCurrentScope, makeSession, setCurrentClient } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDefaultOptions, BrowserClient } from '../src/client';
import { WINDOW } from '../src/helpers';
import { getDefaultBrowserClientOptions } from './helper/browser-client-options';

vi.mock('@sentry/core', async importOriginal => {
  const actual = await importOriginal<typeof SentryCore>();
  return { ...actual, timestampInSeconds: vi.fn(actual.timestampInSeconds) };
});

function setDocumentVisibility(visibilityState: DocumentVisibilityState): void {
  if (WINDOW.document) {
    Object.defineProperty(WINDOW.document, 'visibilityState', { value: visibilityState, configurable: true });
    WINDOW.document.dispatchEvent(new Event('visibilitychange'));
  }
}

function setDocumentHidden(): void {
  setDocumentVisibility('hidden');
}

describe('BrowserClient', () => {
  let client: BrowserClient;

  afterEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    await client?.close();
  });

  it('flushes the client (spans, logs, metrics) when the page becomes hidden', async () => {
    client = new BrowserClient(getDefaultBrowserClientOptions({ sendClientReports: true }));
    const flushSpy = vi.spyOn(client, 'flush').mockReturnValue(Promise.resolve(true) as any);
    const flushOutcomesSpy = vi.spyOn(client as any, '_flushOutcomes');

    setDocumentHidden();

    // The flush is deferred to a microtask so that visibilitychange listeners registered after the
    // client's listener (e.g. browser tracing's background-tab detection) have already run.
    expect(flushSpy).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(flushOutcomesSpy).toHaveBeenCalled();
    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it('checks the clocks for drift when the page is hidden and shown again', () => {
    client = new BrowserClient(getDefaultBrowserClientOptions());
    vi.spyOn(client, 'flush').mockReturnValue(Promise.resolve(true) as any);
    vi.mocked(SentryCore.timestampInSeconds).mockClear();

    setDocumentHidden();
    expect(SentryCore.timestampInSeconds).toHaveBeenCalled();

    vi.mocked(SentryCore.timestampInSeconds).mockClear();
    setDocumentVisibility('visible');
    expect(SentryCore.timestampInSeconds).toHaveBeenCalled();
  });

  it.each([
    ['freeze', () => WINDOW.document],
    ['resume', () => WINDOW.document],
    ['pagehide', () => WINDOW],
    ['pageshow', () => WINDOW],
  ])('checks the clocks for drift on %s', (eventName, getTarget) => {
    client = new BrowserClient(getDefaultBrowserClientOptions());
    vi.mocked(SentryCore.timestampInSeconds).mockClear();

    getTarget().dispatchEvent(new Event(eventName));

    expect(SentryCore.timestampInSeconds).toHaveBeenCalled();
  });

  it('removes its page lifecycle listeners when closed', async () => {
    client = new BrowserClient(getDefaultBrowserClientOptions());
    await client.close();
    const flushSpy = vi.spyOn(client, 'flush');
    vi.mocked(SentryCore.timestampInSeconds).mockClear();

    setDocumentHidden();
    WINDOW.document.dispatchEvent(new Event('freeze'));
    WINDOW.document.dispatchEvent(new Event('resume'));
    WINDOW.dispatchEvent(new Event('pagehide'));
    WINDOW.dispatchEvent(new Event('pageshow'));
    await Promise.resolve();

    expect(SentryCore.timestampInSeconds).not.toHaveBeenCalled();
    expect(flushSpy).not.toHaveBeenCalled();
  });

  it('does not flush outcomes when sendClientReports is disabled but still flushes the client', async () => {
    client = new BrowserClient(getDefaultBrowserClientOptions({ sendClientReports: false }));
    const flushSpy = vi.spyOn(client, 'flush').mockReturnValue(Promise.resolve(true) as any);
    const flushOutcomesSpy = vi.spyOn(client as any, '_flushOutcomes');

    setDocumentHidden();
    await Promise.resolve();

    expect(flushOutcomesSpy).not.toHaveBeenCalled();
    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  describe('routeProvider option', () => {
    it('registers the provider for the client', () => {
      const routeProvider = { resolveRoute: () => '/users/:id', resolveCurrentRoute: () => '/users/:id' };
      client = new BrowserClient(getDefaultBrowserClientOptions({ routeProvider }));

      expect(getRouteProvider(client)).toBe(routeProvider);
    });

    it('is replaced by a provider registered at runtime', () => {
      vi.spyOn(debug, 'warn').mockImplementation(() => {});
      client = new BrowserClient(
        getDefaultBrowserClientOptions({
          routeProvider: { resolveRoute: () => '/option', resolveCurrentRoute: () => '/option' },
        }),
      );

      setRouteProvider({ resolveRoute: () => '/runtime', resolveCurrentRoute: () => '/runtime' }, client);

      expect(resolveCurrentRoute(client)).toBe('/runtime');
    });
  });

  describe('session status on unhandled errors', () => {
    afterEach(() => {
      getCurrentScope().setSession(undefined);
      getCurrentScope().setClient(undefined);
    });

    it('sets the session status to "unhandled" for an unhandled exception', () => {
      client = new BrowserClient(getDefaultBrowserClientOptions());
      setCurrentClient(client);

      const session = makeSession();
      getCurrentScope().setSession(session);

      client.captureException(new Error('test'), { mechanism: { handled: false } });

      expect(session.status).toBe('unhandled');
      expect(session.errors).toBe(1);
    });

    it('sets the session status to "unhandled" for a fatal event', () => {
      client = new BrowserClient(getDefaultBrowserClientOptions());
      setCurrentClient(client);

      const session = makeSession();
      getCurrentScope().setSession(session);

      client.captureEvent({ message: 'test', level: 'fatal' });

      expect(session.status).toBe('unhandled');
    });

    it('keeps the session status "ok" for a handled exception', () => {
      client = new BrowserClient(getDefaultBrowserClientOptions());
      setCurrentClient(client);

      const session = makeSession();
      getCurrentScope().setSession(session);

      client.captureException(new Error('test'));

      expect(session.status).toBe('ok');
      expect(session.errors).toBe(1);
    });
  });
});

describe('applyDefaultOptions', () => {
  it('works with empty options', () => {
    const options = {};
    const actual = applyDefaultOptions(options);

    expect(actual).toEqual({
      release: undefined,
      sendClientReports: true,
      parentSpanIsAlwaysRootSpan: true,
    });
  });

  it('works with options', () => {
    const options = {
      tracesSampleRate: 0.5,
      release: '1.0.0',
    };
    const actual = applyDefaultOptions(options);

    expect(actual).toEqual({
      release: '1.0.0',
      sendClientReports: true,
      tracesSampleRate: 0.5,
      parentSpanIsAlwaysRootSpan: true,
    });
  });

  it('picks up release from WINDOW.SENTRY_RELEASE.id', () => {
    const releaseBefore = WINDOW.SENTRY_RELEASE;

    WINDOW.SENTRY_RELEASE = { id: '1.0.0' };
    const options = {
      tracesSampleRate: 0.5,
    };
    const actual = applyDefaultOptions(options);

    expect(actual).toEqual({
      release: '1.0.0',
      sendClientReports: true,
      tracesSampleRate: 0.5,
      parentSpanIsAlwaysRootSpan: true,
    });

    WINDOW.SENTRY_RELEASE = releaseBefore;
  });

  it('passed in release takes precedence over WINDOW.SENTRY_RELEASE.id', () => {
    const releaseBefore = WINDOW.SENTRY_RELEASE;

    WINDOW.SENTRY_RELEASE = { id: '1.0.0' };
    const options = {
      release: '2.0.0',
      tracesSampleRate: 0.5,
    };
    const actual = applyDefaultOptions(options);

    expect(actual).toEqual({
      release: '2.0.0',
      sendClientReports: true,
      tracesSampleRate: 0.5,
      parentSpanIsAlwaysRootSpan: true,
    });

    WINDOW.SENTRY_RELEASE = releaseBefore;
  });
});

describe('SDK metadata', () => {
  describe('sdk.settings', () => {
    it('sets infer_ip to "auto" by default', () => {
      const options = getDefaultBrowserClientOptions({});
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk?.settings?.infer_ip).toBe('auto');
    });

    it('sets infer_ip to "never" if dataCollection.userInfo is false', () => {
      const options = getDefaultBrowserClientOptions({
        dataCollection: { userInfo: false },
      });
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk?.settings?.infer_ip).toBe('never');
    });

    it("doesn't override already set sdk metadata settings", () => {
      const options = getDefaultBrowserClientOptions({
        _metadata: {
          sdk: {
            settings: {
              infer_ip: 'never',
              // @ts-expect-error -- not typed but let's test anyway
              other_random_setting: 'some value',
            },
          },
        },
      });
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk?.settings).toEqual({
        infer_ip: 'never',
        other_random_setting: 'some value',
      });
    });

    it('still sets infer_ip if other SDK metadata was already passed in', () => {
      const options = getDefaultBrowserClientOptions({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.angular',
          },
        },
      });
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk).toEqual({
        name: 'sentry.javascript.angular',
        settings: {
          infer_ip: 'auto',
        },
      });
    });
  });

  describe('sdk data', () => {
    it('sets sdk.name to "sentry.javascript.browser" by default', () => {
      const options = getDefaultBrowserClientOptions({});
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk?.name).toBe('sentry.javascript.browser');
    });

    it("doesn't override already set sdk metadata", () => {
      const options = getDefaultBrowserClientOptions({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.angular',
          },
        },
      });
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk?.name).toBe('sentry.javascript.angular');
    });

    it('preserves passed-in partial SDK metadata', () => {
      const options = getDefaultBrowserClientOptions({
        _metadata: {
          sdk: {
            settings: {
              infer_ip: 'auto',
            },
          },
        },
        // Usually, this would cause infer_ip to be set to 'auto'
        // but we're passing it in explicitly, so it should be preserved
        dataCollection: { userInfo: false },
      });
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk).toEqual({
        name: 'sentry.javascript.browser',
        version: expect.any(String),
        packages: [{ name: 'npm:@sentry/browser', version: expect.any(String) }],
        settings: {
          infer_ip: 'auto',
        },
      });
    });
  });
});
