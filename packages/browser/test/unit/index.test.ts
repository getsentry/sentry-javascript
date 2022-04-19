import { SDK_VERSION } from '@sentry/core';

import {
  addBreadcrumb,
  BrowserClient,
  captureEvent,
  captureException,
  captureMessage,
  configureScope,
  Event,
  flush,
  getCurrentHub,
  init,
  Integrations,
  Scope,
  showReportDialog,
  wrap,
} from '../../src';
import { getDefaultBrowserClientOptions } from './helper/browser-client-options';
import { SimpleTransport } from './mocks/simpletransport';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

// eslint-disable-next-line no-var
declare var global: any;

describe('SentryBrowser', () => {
  const beforeSend = jest.fn();

  beforeAll(() => {
    init({
      beforeSend,
      dsn,
      transport: SimpleTransport,
    });
  });

  beforeEach(() => {
    getCurrentHub().pushScope();
  });

  afterEach(() => {
    getCurrentHub().popScope();
    beforeSend.mockReset();
  });

  describe('getContext() / setContext()', () => {
    it('should store/load extra', () => {
      configureScope((scope: Scope) => {
        scope.setExtra('abc', { def: [1] });
      });
      expect(global.__SENTRY__.hub._stack[1].scope._extra).toEqual({
        abc: { def: [1] },
      });
    });

    it('should store/load tags', () => {
      configureScope((scope: Scope) => {
        scope.setTag('abc', 'def');
      });
      expect(global.__SENTRY__.hub._stack[1].scope._tags).toEqual({
        abc: 'def',
      });
    });

    it('should store/load user', () => {
      configureScope((scope: Scope) => {
        scope.setUser({ id: 'def' });
      });
      expect(global.__SENTRY__.hub._stack[1].scope._user).toEqual({
        id: 'def',
      });
    });
  });

  describe('showReportDialog', () => {
    describe('user', () => {
      const EX_USER = { email: 'test@example.com' };
      const options = getDefaultBrowserClientOptions({ dsn });
      const client = new BrowserClient(options, new SimpleTransport({ dsn }));
      const reportDialogSpy = jest.spyOn(client, 'showReportDialog');

      beforeEach(() => {
        reportDialogSpy.mockReset();
      });

      it('uses the user on the scope', () => {
        configureScope(scope => {
          scope.setUser(EX_USER);
        });
        getCurrentHub().bindClient(client);

        showReportDialog();

        expect(reportDialogSpy).toBeCalled();
        expect(reportDialogSpy.mock.calls[0][0]!.user!.email).toBe(EX_USER.email);
      });

      it('prioritizes options user over scope user', () => {
        configureScope(scope => {
          scope.setUser(EX_USER);
        });
        getCurrentHub().bindClient(client);

        const DIALOG_OPTION_USER = { email: 'option@example.com' };
        showReportDialog({ user: DIALOG_OPTION_USER });

        expect(reportDialogSpy).toBeCalled();
        expect(reportDialogSpy.mock.calls[0][0]!.user!.email).toBe(DIALOG_OPTION_USER.email);
      });
    });
  });

  describe('breadcrumbs', () => {
    it('should record breadcrumbs', async () => {
      addBreadcrumb({ message: 'test1' });
      addBreadcrumb({ message: 'test2' });

      captureMessage('event');
      await flush(2000);
      expect(beforeSend.mock.calls[0][0].breadcrumbs).toHaveLength(2);
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

      const event = beforeSend.mock.calls[0][0];
      expect(event.exception).toBeDefined();
      expect(event.exception.values[0]).toBeDefined();
      expect(event.exception.values[0].type).toBe('Error');
      expect(event.exception.values[0].value).toBe('test');
      expect(event.exception.values[0].stacktrace.frames).not.toHaveLength(0);
    });

    it('should capture a message', done => {
      const options = getDefaultBrowserClientOptions({
        beforeSend: (event: Event): Event | null => {
          expect(event.message).toBe('test');
          expect(event.exception).toBeUndefined();
          done();
          return event;
        },
        dsn,
      });
      getCurrentHub().bindClient(new BrowserClient(options, new SimpleTransport({ dsn })));
      captureMessage('test');
    });

    it('should capture an event', done => {
      const options = getDefaultBrowserClientOptions({
        beforeSend: (event: Event): Event | null => {
          expect(event.message).toBe('event');
          expect(event.exception).toBeUndefined();
          done();
          return event;
        },
        dsn,
      });
      getCurrentHub().bindClient(new BrowserClient(options, new SimpleTransport({ dsn })));
      captureEvent({ message: 'event' });
    });

    it('should not dedupe an event on bound client', async () => {
      const localBeforeSend = jest.fn();
      const options = getDefaultBrowserClientOptions({
        beforeSend: localBeforeSend,
        dsn,
        integrations: [],
      });
      getCurrentHub().bindClient(new BrowserClient(options, new SimpleTransport({ dsn })));

      captureMessage('event222');
      captureMessage('event222');

      await flush(10);

      expect(localBeforeSend).toHaveBeenCalledTimes(2);
    });

    it('should use inboundfilter rules of bound client', async () => {
      const localBeforeSend = jest.fn();
      const options = getDefaultBrowserClientOptions({
        beforeSend: localBeforeSend,
        dsn,
        integrations: [new Integrations.InboundFilters({ ignoreErrors: ['capture'] })],
      });
      getCurrentHub().bindClient(new BrowserClient(options, new SimpleTransport({ dsn })));

      captureMessage('capture');

      await flush(2000);

      expect(localBeforeSend).not.toHaveBeenCalled();
    });
  });
});

describe('SentryBrowser initialization', () => {
  it('should use window.SENTRY_RELEASE to set release on initialization if available', () => {
    global.SENTRY_RELEASE = { id: 'foobar' };
    init({ dsn });
    expect(global.__SENTRY__.hub._stack[0].client.getOptions().release).toBe('foobar');
    delete global.SENTRY_RELEASE;
  });

  it('should use initialScope', () => {
    init({ dsn, initialScope: { tags: { a: 'b' } } });
    expect(global.__SENTRY__.hub._stack[0].scope._tags).toEqual({ a: 'b' });
  });

  it('should use initialScope Scope', () => {
    const scope = new Scope();
    scope.setTags({ a: 'b' });
    init({ dsn, initialScope: scope });
    expect(global.__SENTRY__.hub._stack[0].scope._tags).toEqual({ a: 'b' });
  });

  it('should use initialScope callback', () => {
    init({
      dsn,
      initialScope: scope => {
        scope.setTags({ a: 'b' });
        return scope;
      },
    });
    expect(global.__SENTRY__.hub._stack[0].scope._tags).toEqual({ a: 'b' });
  });

  it('should have initialization proceed as normal if window.SENTRY_RELEASE is not set', () => {
    // This is mostly a happy-path test to ensure that the initialization doesn't throw an error.
    init({ dsn });
    expect(global.__SENTRY__.hub._stack[0].client.getOptions().release).toBeUndefined();
  });

  describe('SDK metadata', () => {
    it('should set SDK data when Sentry.init() is called', () => {
      init({ dsn });

      const sdkData = (getCurrentHub().getClient() as any).getTransport()._api.metadata?.sdk;

      expect(sdkData?.name).toBe('sentry.javascript.browser');
      expect(sdkData?.packages[0].name).toBe('npm:@sentry/browser');
      expect(sdkData?.packages[0].version).toBe(SDK_VERSION);
      expect(sdkData?.version).toBe(SDK_VERSION);
    });

    it('should set SDK data when instantiating a client directly', () => {
      const options = getDefaultBrowserClientOptions({ dsn });
      const client = new BrowserClient(options, new SimpleTransport({ dsn }));

      const sdkData = (client.getTransport() as any)._api.metadata?.sdk;

      expect(sdkData.name).toBe('sentry.javascript.browser');
      expect(sdkData.packages[0].name).toBe('npm:@sentry/browser');
      expect(sdkData.packages[0].version).toBe(SDK_VERSION);
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

      const sdkData = (getCurrentHub().getClient() as any).getTransport()._api.metadata?.sdk;

      expect(sdkData.name).toBe('sentry.javascript.angular');
      expect(sdkData.packages[0].name).toBe('npm:@sentry/angular');
      expect(sdkData.packages[0].version).toBe(SDK_VERSION);
      expect(sdkData.version).toBe(SDK_VERSION);
    });
  });
});

describe('wrap()', () => {
  it('should wrap and call function while capturing error', done => {
    const options = getDefaultBrowserClientOptions({
      beforeSend: (event: Event): Event | null => {
        expect(event.exception!.values![0].type).toBe('TypeError');
        expect(event.exception!.values![0].value).toBe('mkey');
        done();
        return null;
      },
      dsn,
    });
    getCurrentHub().bindClient(new BrowserClient(options, new SimpleTransport({ dsn })));

    try {
      wrap(() => {
        throw new TypeError('mkey');
      });
    } catch (e) {
      // no-empty
    }
  });

  it('should return result of a function call', () => {
    const result = wrap(() => 2);
    expect(result).toBe(2);
  });

  it('should allow for passing this and arguments through binding', () => {
    const result = wrap(
      function (this: unknown, a: string, b: number): unknown[] {
        return [this, a, b];
      }.bind({ context: 'this' }, 'b', 42),
    );

    expect((result as unknown[])[0]).toEqual({ context: 'this' });
    expect((result as unknown[])[1]).toBe('b');
    expect((result as unknown[])[2]).toBe(42);

    const result2 = wrap(
      function (this: { x: number }): number {
        return this.x;
      }.bind({ x: 42 }),
    );

    expect(result2).toBe(42);
  });
});
