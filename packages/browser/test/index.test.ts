import { expect } from 'chai';
import { SinonSpy, spy, stub } from 'sinon';
import {
  addBreadcrumb,
  BrowserBackend,
  BrowserClient,
  captureEvent,
  captureException,
  captureMessage,
  configureScope,
  getCurrentHub,
  init,
  Integrations,
  Scope,
  SentryEvent,
  Status,
} from '../src';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

declare var global: any;

describe('SentryBrowser', () => {
  const beforeSend: SinonSpy = spy();

  before(() => {
    init({
      beforeSend,
      dsn,
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
      expect(global.__SENTRY__.hub.stack[1].scope.extra).to.deep.equal({
        abc: { def: [1] },
      });
    });

    it('should store/load tags', () => {
      configureScope((scope: Scope) => {
        scope.setTag('abc', 'def');
      });
      expect(global.__SENTRY__.hub.stack[1].scope.tags).to.deep.equal({
        abc: 'def',
      });
    });

    it('should store/load user', () => {
      configureScope((scope: Scope) => {
        scope.setUser({ id: 'def' });
      });
      expect(global.__SENTRY__.hub.stack[1].scope.user).to.deep.equal({
        id: 'def',
      });
    });
  });

  describe('breadcrumbs', () => {
    let s: sinon.SinonStub;

    beforeEach(() => {
      s = stub(BrowserBackend.prototype, 'sendEvent').returns(Promise.resolve({ status: Status.Success }));
    });

    afterEach(() => {
      s.restore();
    });

    it('should record breadcrumbs', async () => {
      addBreadcrumb({ message: 'test1' });
      addBreadcrumb({ message: 'test2' });

      captureMessage('event');
      await (getCurrentHub().getClient() as BrowserClient).close(2000);
      expect(beforeSend.args[0][0].breadcrumbs).to.have.lengthOf(2);
    });
  });

  describe('capture', () => {
    let s: sinon.SinonStub;

    beforeEach(() => {
      s = stub(BrowserBackend.prototype, 'sendEvent').returns(Promise.resolve({ status: Status.Success }));
    });

    afterEach(() => {
      s.restore();
    });

    it('should capture an exception', async () => {
      try {
        throw new Error('test');
      } catch (e) {
        captureException(e);
      }

      await (getCurrentHub().getClient() as BrowserClient).close(2000);

      const event = beforeSend.args[0][0];
      expect(event.exception).to.not.be.undefined;
      expect(event.exception.values[0]).to.not.be.undefined;
      expect(event.exception.values[0].type).to.equal('Error');
      expect(event.exception.values[0].value).to.equal('test');
      expect(event.exception.values[0].stacktrace).to.not.be.empty;
    });

    it('should capture a message', done => {
      getCurrentHub().bindClient(
        new BrowserClient({
          beforeSend: (event: SentryEvent) => {
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
          beforeSend: (event: SentryEvent) => {
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

    it('should dedupe an event', async () => {
      captureMessage('event222');
      captureMessage('event222');

      await (getCurrentHub().getClient() as BrowserClient).close(2000);

      expect(beforeSend.calledOnce).to.be.true;
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

      await (getCurrentHub().getClient() as BrowserClient).close(2000);

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

      await (getCurrentHub().getClient() as BrowserClient).close(2000);

      expect(localBeforeSend.called).to.be.false;
    });
  });
});
