import { SDK_VERSION } from '@sentry/core';
import { expect } from 'chai';
import { SinonSpy, spy } from 'sinon';

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
import { SimpleTransport } from './mocks/simpletransport';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

// eslint-disable-next-line @typescript-eslint/no-explicit-any, no-var
declare var global: any;

describe('SentryBrowser', () => {
  const beforeSend: SinonSpy<[Event], Event> = spy((event: Event) => event);

  before(() => {
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
    beforeSend.resetHistory();
  });

  describe('getContext() / setContext()', () => {
    it('should store/load extra', () => {
      configureScope((scope: Scope) => {
        scope.setExtra('abc', { def: [1] });
      });
      expect(global.__SENTRY__.hub._stack[1].scope._extra).to.deep.equal({
        abc: { def: [1] },
      });
    });

    it('should store/load tags', () => {
      configureScope((scope: Scope) => {
        scope.setTag('abc', 'def');
      });
      expect(global.__SENTRY__.hub._stack[1].scope._tags).to.deep.equal({
        abc: 'def',
      });
    });

    it('should store/load user', () => {
      configureScope((scope: Scope) => {
        scope.setUser({ id: 'def' });
      });
      expect(global.__SENTRY__.hub._stack[1].scope._user).to.deep.equal({
        id: 'def',
      });
    });
  });

  describe('showReportDialog', () => {
    describe('user', () => {
      const EX_USER = { email: 'test@example.com' };
      const client = new BrowserClient({ dsn });
      spy(client, 'showReportDialog');

      it('uses the user on the scope', () => {
        configureScope(scope => {
          scope.setUser(EX_USER);
        });
        getCurrentHub().bindClient(client);

        showReportDialog();

        expect((client.showReportDialog as SinonSpy).called).to.be.true;
        expect((client.showReportDialog as SinonSpy).lastCall.args[0].user.email).to.eq(EX_USER.email);
      });

      it('prioritizes options user over scope user', () => {
        configureScope(scope => {
          scope.setUser(EX_USER);
        });
        getCurrentHub().bindClient(client);

        const DIALOG_OPTION_USER = { email: 'option@example.com' };
        showReportDialog({ user: DIALOG_OPTION_USER });

        expect((client.showReportDialog as SinonSpy).called).to.be.true;
        expect((client.showReportDialog as SinonSpy).lastCall.args[0].user.email).to.eq(DIALOG_OPTION_USER.email);
      });
    });
  });

  describe('breadcrumbs', () => {
    it('should record breadcrumbs', async () => {
      addBreadcrumb({ message: 'test1' });
      addBreadcrumb({ message: 'test2' });

      captureMessage('event');
      await flush(2000);
      expect(beforeSend.args[0][0].breadcrumbs).to.have.lengthOf(2);
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

      const event = beforeSend.args[0][0];
      expect(event.exception).to.not.be.undefined;
      /* eslint-disable @typescript-eslint/no-non-null-assertion */
      expect(event.exception!.values![0]).to.not.be.undefined;
      expect(event.exception!.values![0].type).to.equal('Error');
      expect(event.exception!.values![0].value).to.equal('test');
      expect(event.exception!.values![0].stacktrace).to.not.be.empty;
      /* eslint-enable @typescript-eslint/no-non-null-assertion */
    });

    it('should capture a message', done => {
      getCurrentHub().bindClient(
        new BrowserClient({
          beforeSend: (event: Event): Event | null => {
            expect(event.message).to.equal('test');
            expect(event.exception).to.be.undefined;
            done();
            return event;
          },
          dsn,
        }),
      );
      captureMessage('test');
    });

    it('should capture an event', done => {
      getCurrentHub().bindClient(
        new BrowserClient({
          beforeSend: (event: Event): Event | null => {
            expect(event.message).to.equal('event');
            expect(event.exception).to.be.undefined;
            done();
            return event;
          },
          dsn,
        }),
      );
      captureEvent({ message: 'event' });
    });

    it('should not dedupe an event on bound client', async () => {
      const localBeforeSend = spy();
      getCurrentHub().bindClient(
        new BrowserClient({
          beforeSend: localBeforeSend,
          dsn,
          integrations: [],
        }),
      );

      captureMessage('event222');
      captureMessage('event222');

      await flush(10);

      expect(localBeforeSend.calledTwice).to.be.true;
    });

    it('should use inboundfilter rules of bound client', async () => {
      const localBeforeSend = spy();
      getCurrentHub().bindClient(
        new BrowserClient({
          beforeSend: localBeforeSend,
          dsn,
          integrations: [new Integrations.InboundFilters({ ignoreErrors: ['capture'] })],
        }),
      );

      captureMessage('capture');

      await flush(2000);

      expect(localBeforeSend.called).to.be.false;
    });
  });
});

describe('SentryBrowser initialization', () => {
  it('should use window.SENTRY_RELEASE to set release on initialization if available', () => {
    global.SENTRY_RELEASE = { id: 'foobar' };
    init({ dsn });
    expect(global.__SENTRY__.hub._stack[0].client.getOptions().release).to.equal('foobar');
    delete global.SENTRY_RELEASE;
  });

  it('should use initialScope', () => {
    init({ dsn, initialScope: { tags: { a: 'b' } } });
    expect(global.__SENTRY__.hub._stack[0].scope._tags).to.deep.equal({ a: 'b' });
  });

  it('should use initialScope Scope', () => {
    const scope = new Scope();
    scope.setTags({ a: 'b' });
    init({ dsn, initialScope: scope });
    expect(global.__SENTRY__.hub._stack[0].scope._tags).to.deep.equal({ a: 'b' });
  });

  it('should use initialScope callback', () => {
    init({
      dsn,
      initialScope: scope => {
        scope.setTags({ a: 'b' });
        return scope;
      },
    });
    expect(global.__SENTRY__.hub._stack[0].scope._tags).to.deep.equal({ a: 'b' });
  });

  it('should have initialization proceed as normal if window.SENTRY_RELEASE is not set', () => {
    // This is mostly a happy-path test to ensure that the initialization doesn't throw an error.
    init({ dsn });
    expect(global.__SENTRY__.hub._stack[0].client.getOptions().release).to.be.undefined;
  });

  describe('SDK metadata', () => {
    it('should set SDK data when Sentry.init() is called', () => {
      init({ dsn });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdkData = (getCurrentHub().getClient() as any)._backend._transport._api.metadata?.sdk;

      expect(sdkData.name).to.equal('sentry.javascript.browser');
      expect(sdkData.packages[0].name).to.equal('npm:@sentry/browser');
      expect(sdkData.packages[0].version).to.equal(SDK_VERSION);
      expect(sdkData.version).to.equal(SDK_VERSION);
    });

    it('should set SDK data when instantiating a client directly', () => {
      const client = new BrowserClient({ dsn });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdkData = (client as any)._backend._transport._api.metadata?.sdk;

      expect(sdkData.name).to.equal('sentry.javascript.browser');
      expect(sdkData.packages[0].name).to.equal('npm:@sentry/browser');
      expect(sdkData.packages[0].version).to.equal(SDK_VERSION);
      expect(sdkData.version).to.equal(SDK_VERSION);
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdkData = (getCurrentHub().getClient() as any)._backend._transport._api.metadata?.sdk;

      expect(sdkData.name).to.equal('sentry.javascript.angular');
      expect(sdkData.packages[0].name).to.equal('npm:@sentry/angular');
      expect(sdkData.packages[0].version).to.equal(SDK_VERSION);
      expect(sdkData.version).to.equal(SDK_VERSION);
    });
  });
});

describe('wrap()', () => {
  it('should wrap and call function while capturing error', done => {
    getCurrentHub().bindClient(
      new BrowserClient({
        beforeSend: (event: Event): Event | null => {
          /* eslint-disable @typescript-eslint/no-non-null-assertion */
          expect(event.exception!.values![0].type).to.equal('TypeError');
          expect(event.exception!.values![0].value).to.equal('mkey');
          /* eslint-enable @typescript-eslint/no-non-null-assertion */
          done();
          return null;
        },
        dsn,
      }),
    );

    wrap(() => {
      throw new TypeError('mkey');
    });
  });

  it('should return result of a function call', () => {
    const result = wrap(() => 2);
    expect(result).to.equal(2);
  });

  it('should allow for passing this and arguments through binding', () => {
    const result = wrap(
      function(this: unknown, a: string, b: number): unknown[] {
        return [this, a, b];
      }.bind({ context: 'this' }, 'b', 42),
    );

    expect((result as unknown[])[0]).to.deep.equal({ context: 'this' });
    expect((result as unknown[])[1]).to.equal('b');
    expect((result as unknown[])[2]).to.equal(42);

    const result2 = wrap(
      function(this: { x: number }): number {
        return this.x;
      }.bind({ x: 42 }),
    );

    expect(result2).to.equal(42);
  });
});
