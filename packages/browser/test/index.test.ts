/**
 * @vitest-environment jsdom
 */

import {
  eventFiltersIntegration,
  getGlobalScope,
  getIsolationScope,
  getReportDialogEndpoint,
  lastEventId,
  SDK_VERSION,
} from '@sentry/core';
import * as utils from '@sentry/core';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addBreadcrumb,
  BrowserClient,
  captureEvent,
  captureException,
  captureMessage,
  flush,
  getClient,
  getCurrentScope,
  init,
  logger,
  Scope,
  setCurrentClient,
  showReportDialog,
  WINDOW,
} from '../src';
import { getDefaultBrowserClientOptions } from './helper/browser-client-options';
import { makeSimpleTransport } from './mocks/simpletransport';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

// eslint-disable-next-line no-var
declare var global: any;

vi.mock('@sentry/core', async requireActual => {
  return {
    ...((await requireActual()) as any),
    getReportDialogEndpoint: vi.fn(),
  };
});

describe('SentryBrowser', () => {
  const beforeSend = vi.fn(event => event);

  beforeEach(() => {
    getGlobalScope().clear();
    getIsolationScope().clear();
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);

    init({
      beforeSend,
      dsn,
      transport: makeSimpleTransport,
    });
  });

  afterEach(() => {
    beforeSend.mockClear();
  });

  describe('getContext() / setContext()', () => {
    it('should store/load extra', () => {
      getCurrentScope().setExtra('abc', { def: [1] });
      expect(getCurrentScope().getScopeData().extra).toEqual({
        abc: { def: [1] },
      });
    });

    it('should store/load tags', () => {
      getCurrentScope().setTag('abc', 'def');
      expect(getCurrentScope().getScopeData().tags).toEqual({
        abc: 'def',
      });
    });

    it('should store/load user', () => {
      getCurrentScope().setUser({ id: 'def' });
      expect(getCurrentScope().getScopeData().user).toEqual({
        id: 'def',
      });
    });
  });

  describe('showReportDialog', () => {
    beforeEach(() => {
      (getReportDialogEndpoint as Mock).mockReset();
    });

    describe('user', () => {
      const EX_USER = { email: 'test@example.com' };
      const options = getDefaultBrowserClientOptions({ dsn });
      const client = new BrowserClient(options);
      it('uses the user on the scope', () => {
        getCurrentScope().setUser(EX_USER);
        setCurrentClient(client);

        showReportDialog();

        expect(getReportDialogEndpoint).toHaveBeenCalledTimes(1);
        expect(getReportDialogEndpoint).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({ user: { email: EX_USER.email } }),
        );
      });

      it('uses `lastEventId` from isolation scope', async () => {
        setCurrentClient(client);
        const eventId = captureException(new Error('Some error'));
        await flush(2000);

        showReportDialog();

        expect(eventId).toEqual(lastEventId());
        expect(getReportDialogEndpoint).toHaveBeenCalledTimes(1);
        expect(getReportDialogEndpoint).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ eventId }));
      });

      it('uses the passed in `eventId` over `lastEventId`', async () => {
        setCurrentClient(client);
        captureException(new Error('Some error'));
        await flush(2000);

        showReportDialog({ eventId: 'foobar' });
        expect(getReportDialogEndpoint).toHaveBeenCalledTimes(1);
        expect(getReportDialogEndpoint).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({ eventId: 'foobar' }),
        );
      });

      it('prioritizes options user over scope user', () => {
        getCurrentScope().setUser(EX_USER);
        setCurrentClient(client);

        const DIALOG_OPTION_USER = { email: 'option@example.com' };
        showReportDialog({ user: DIALOG_OPTION_USER });

        expect(getReportDialogEndpoint).toHaveBeenCalledTimes(1);
        expect(getReportDialogEndpoint).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({ user: { email: DIALOG_OPTION_USER.email } }),
        );
      });
    });

    describe('onClose', () => {
      const dummyErrorHandler = vi.fn();
      beforeEach(() => {
        // this prevents vi-environment-jsdom from failing the test
        // when an error in `onClose` is thrown
        // it does not prevent errors thrown directly inside the test,
        // so we don't have to worry about tests passing that should
        // otherwise fail
        // see: https://github.com/vijs/vi/blob/main/packages/vi-environment-jsdom/src/index.ts#L95-L115
        WINDOW.addEventListener('error', dummyErrorHandler);
      });

      afterEach(() => {
        WINDOW.removeEventListener('error', dummyErrorHandler);
      });

      const waitForPostMessage = async (message: string) => {
        WINDOW.postMessage(message, '*');
        await flush(10);
      };

      it('should call `onClose` when receiving `__sentry_reportdialog_closed__` MessageEvent', async () => {
        const onClose = vi.fn();

        showReportDialog({ onClose });

        await waitForPostMessage('__sentry_reportdialog_closed__');
        expect(onClose).toHaveBeenCalledTimes(1);

        // ensure the event handler has been removed so onClose is not called again
        await waitForPostMessage('__sentry_reportdialog_closed__');
        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('should call `onClose` only once even if it throws', async () => {
        const onClose = vi.fn(() => {
          throw new Error();
        });

        showReportDialog({ onClose });

        await waitForPostMessage('__sentry_reportdialog_closed__');
        expect(onClose).toHaveBeenCalledTimes(1);

        // ensure the event handler has been removed so onClose is not called again
        await waitForPostMessage('__sentry_reportdialog_closed__');
        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('should not call `onClose` for other MessageEvents', async () => {
        const onClose = vi.fn();

        showReportDialog({ onClose });

        await waitForPostMessage('some_message');
        expect(onClose).not.toHaveBeenCalled();

        await waitForPostMessage('__sentry_reportdialog_closed__');
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('breadcrumbs', () => {
    it('should record breadcrumbs', async () => {
      addBreadcrumb({ message: 'test1' });
      addBreadcrumb({ message: 'test2' });

      captureMessage('event');
      await flush(2000);
      expect(beforeSend.mock.calls[0]?.[0]?.breadcrumbs).toHaveLength(2);
    });
  });

  describe('capture', () => {
    it('should capture an exception', async () => {
      try {
        throw new Error('test');
      } catch (e) {
        captureException(e);
      }

      await flush(2000);

      const event = beforeSend.mock.calls[0]?.[0];
      expect(event.level).toBe('error');
      expect(event.exception).toBeDefined();
      expect(event.exception.values[0]).toBeDefined();
      expect(event.exception.values[0]?.type).toBe('Error');
      expect(event.exception.values[0]?.value).toBe('test');
      expect(event.exception.values[0]?.stacktrace.frames).not.toHaveLength(0);
    });

    it('should capture an message', () =>
      new Promise<void>(resolve => {
        const options = getDefaultBrowserClientOptions({
          beforeSend: event => {
            expect(event.level).toBe('info');
            expect(event.message).toBe('test');
            expect(event.exception).toBeUndefined();
            resolve();
            return event;
          },
          dsn,
        });
        setCurrentClient(new BrowserClient(options));
        captureMessage('test');
      }));

    it('should capture an event', () =>
      new Promise<void>(resolve => {
        const options = getDefaultBrowserClientOptions({
          beforeSend: event => {
            expect(event.message).toBe('event');
            expect(event.exception).toBeUndefined();
            resolve();
            return event;
          },
          dsn,
        });
        setCurrentClient(new BrowserClient(options));
        captureEvent({ message: 'event' });
      }));

    it('should set `platform` on events', () =>
      new Promise<void>(resolve => {
        const options = getDefaultBrowserClientOptions({
          beforeSend: event => {
            expect(event.platform).toBe('javascript');
            resolve();
            return event;
          },
          dsn,
        });
        setCurrentClient(new BrowserClient(options));
        captureEvent({ message: 'event' });
      }));

    it('should not dedupe an event on bound client', async () => {
      const localBeforeSend = vi.fn();
      const options = getDefaultBrowserClientOptions({
        beforeSend: localBeforeSend,
        dsn,
        integrations: [],
      });
      setCurrentClient(new BrowserClient(options));

      captureMessage('event222');
      captureMessage('event222');

      await flush(10);

      expect(localBeforeSend).toHaveBeenCalledTimes(2);
    });

    it('should use eventFilters rules of bound client', async () => {
      const localBeforeSend = vi.fn();
      const options = getDefaultBrowserClientOptions({
        beforeSend: localBeforeSend,
        dsn,
        integrations: [eventFiltersIntegration({ ignoreErrors: ['capture'] })],
      });
      const client = new BrowserClient(options);
      setCurrentClient(client);
      client.init();

      captureMessage('capture');

      await flush(2000);

      expect(localBeforeSend).not.toHaveBeenCalled();
    });
  });

  describe('logger', () => {
    it('exports all log methods', () => {
      expect(logger).toBeDefined();
      expect(logger.trace).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.fatal).toBeDefined();
    });
  });
});

describe('SentryBrowser initialization', () => {
  it('should use window.SENTRY_RELEASE to set release on initialization if available', () => {
    global.SENTRY_RELEASE = { id: 'foobar' };
    init({ dsn });
    expect(getClient()?.getOptions().release).toBe('foobar');
    delete global.SENTRY_RELEASE;
  });

  it('should use initialScope', () => {
    init({ dsn, initialScope: { tags: { a: 'b' } } });
    expect(getCurrentScope().getScopeData().tags).toEqual({ a: 'b' });
  });

  it('should use initialScope Scope', () => {
    const scope = new Scope();
    scope.setTags({ a: 'b' });
    init({ dsn, initialScope: scope });
    expect(getCurrentScope().getScopeData().tags).toEqual({ a: 'b' });
  });

  it('should use initialScope callback', () => {
    init({
      dsn,
      initialScope: scope => {
        scope.setTags({ a: 'b' });
        return scope;
      },
    });
    expect(getCurrentScope().getScopeData().tags).toEqual({ a: 'b' });
  });

  it('should have initialization proceed as normal if window.SENTRY_RELEASE is not set', () => {
    // This is mostly a happy-path test to ensure that the initialization doesn't throw an error.
    init({ dsn });
    expect(getClient()?.getOptions().release).toBeUndefined();
  });

  describe('SDK metadata', () => {
    it('should set SDK data when Sentry.init() is called', () => {
      init({ dsn });

      const sdkData = getClient()?.getOptions()._metadata?.sdk || {};

      expect(sdkData.name).toBe('sentry.javascript.browser');
      expect(sdkData.packages?.[0]?.name).toBe('npm:@sentry/browser');
      expect(sdkData.packages?.[0]?.version).toBe(SDK_VERSION);
      expect(sdkData.version).toBe(SDK_VERSION);
    });

    it('uses SDK source from window for package name', () => {
      global.SENTRY_SDK_SOURCE = 'loader';
      init({ dsn });

      const sdkData = getClient()?.getOptions()._metadata?.sdk || {};

      expect(sdkData.packages?.[0]?.name).toBe('loader:@sentry/browser');
      delete global.SENTRY_SDK_SOURCE;
    });

    it('uses SDK source from global for package name', () => {
      const spy = vi.spyOn(utils, 'getSDKSource').mockReturnValue('cdn');
      init({ dsn });

      const sdkData = getClient()?.getOptions()._metadata?.sdk || {};

      expect(sdkData.packages?.[0]?.name).toBe('cdn:@sentry/browser');
      expect(utils.getSDKSource).toBeCalledTimes(1);
      spy.mockRestore();
    });

    it('should set SDK data when instantiating a client directly', () => {
      const options = getDefaultBrowserClientOptions({ dsn });
      const client = new BrowserClient(options);

      const sdkData = client.getOptions()._metadata?.sdk as any;

      expect(sdkData.name).toBe('sentry.javascript.browser');
      expect(sdkData.packages[0]?.name).toBe('npm:@sentry/browser');
      expect(sdkData.packages[0]?.version).toBe(SDK_VERSION);
      expect(sdkData.version).toBe(SDK_VERSION);
    });

    // wrapper packages (like @sentry/angular and @sentry/react) set their SDK data in their `init` methods, which are
    // called before the client is instantiated, and we don't want to clobber that data
    it("shouldn't overwrite SDK data that's already there", () => {
      init({
        dsn,
        // this would normally be set by the wrapper SDK in init()
        _metadata: {
          sdk: {
            name: 'sentry.javascript.angular',
            packages: [
              {
                name: 'npm:@sentry/angular',
                version: SDK_VERSION,
              },
            ],
            version: SDK_VERSION,
          },
        },
      });

      const sdkData = getClient()?.getOptions()._metadata?.sdk || {};

      expect(sdkData.name).toBe('sentry.javascript.angular');
      expect(sdkData.packages?.[0]?.name).toBe('npm:@sentry/angular');
      expect(sdkData.packages?.[0]?.version).toBe(SDK_VERSION);
      expect(sdkData.version).toBe(SDK_VERSION);
    });
  });
});
