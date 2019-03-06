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
} from '../src';
import { SimpleTransport } from './mocks/simpletransport';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

declare var global: any;

describe('SentryBrowser', () => {
  const beforeSend: SinonSpy = spy((event: Event) => event);

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
      expect(event.exception.values[0]).to.not.be.undefined;
      expect(event.exception.values[0].type).to.equal('Error');
      expect(event.exception.values[0].value).to.equal('test');
      expect(event.exception.values[0].stacktrace).to.not.be.empty;
    });

    it('should capture a message', done => {
      getCurrentHub().bindClient(
        new BrowserClient({
          beforeSend: (event: Event) => {
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
          beforeSend: (event: Event) => {
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

      await flush(2000);

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
