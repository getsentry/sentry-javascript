import { expect } from 'chai';
import * as RavenJS from 'raven-js';
import { stub } from 'sinon';
import {
  addBreadcrumb,
  BrowserBackend,
  BrowserClient,
  captureEvent,
  captureException,
  captureMessage,
  configureScope,
  init,
  popScope,
  pushScope,
  Scope,
  SentryEvent,
} from '../src';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

declare var global: any;

describe('SentryBrowser', () => {
  before(() => {
    init({ dsn });
  });

  beforeEach(() => {
    pushScope();
  });

  afterEach(() => {
    popScope();
  });

  describe('getContext() / setContext()', () => {
    it('should store/load extra', () => {
      configureScope((scope: Scope) => {
        scope.setExtra('abc', { def: [1] });
      });
      expect(global.__SENTRY__.stack[1].scope.extra).to.deep.equal({
        abc: { def: [1] },
      });
    });

    it('should store/load tags', () => {
      configureScope((scope: Scope) => {
        scope.setTag('abc', 'def');
      });
      expect(global.__SENTRY__.stack[1].scope.tags).to.deep.equal({
        abc: 'def',
      });
    });

    it('should store/load user', () => {
      configureScope((scope: Scope) => {
        scope.setUser({ id: 'def' });
      });
      expect(global.__SENTRY__.stack[1].scope.user).to.deep.equal({
        id: 'def',
      });
    });
  });

  describe('breadcrumbs', () => {
    let s: sinon.SinonStub;

    beforeEach(() => {
      s = stub(BrowserBackend.prototype, 'sendEvent').returns(
        Promise.resolve(200),
      );
    });

    afterEach(() => {
      s.restore();
    });

    it('should record auto breadcrumbs', done => {
      pushScope(
        new BrowserClient({
          afterSend: (event: SentryEvent) => {
            expect(event.breadcrumbs!).to.have.lengthOf(3);
            done();
          },
          dsn,
        }),
      );

      addBreadcrumb({ message: 'test1' });

      // Simulates internal capture breadcrumb from raven
      RavenJS.captureBreadcrumb({
        category: 'console',
        level: 'warning',
        message: 'testy',
      });

      addBreadcrumb({ message: 'test2' });

      captureMessage('event');
      popScope();
    });
  });

  describe('capture', () => {
    let s: sinon.SinonStub;

    beforeEach(() => {
      s = stub(BrowserBackend.prototype, 'sendEvent').returns(
        Promise.resolve(200),
      );
    });

    afterEach(() => {
      s.restore();
    });

    it('should capture an exception', done => {
      pushScope(
        new BrowserClient({
          afterSend: (event: SentryEvent) => {
            expect(event.exception).to.not.be.undefined;
            expect(event.exception![0]).to.not.be.undefined;
            expect(event.exception![0].type).to.equal('Error');
            expect(event.exception![0].value).to.equal('test');
            expect(event.exception![0].stacktrace).to.not.be.empty;
            done();
          },
          dsn,
        }),
      );
      try {
        throw new Error('test');
      } catch (e) {
        captureException(e);
      }
      popScope();
    });

    it('should capture a message', done => {
      pushScope(
        new BrowserClient({
          afterSend: (event: SentryEvent) => {
            expect(event.message).to.equal('test');
            expect(event.exception).to.be.undefined;
            done();
          },
          dsn,
        }),
      );
      captureMessage('test');
      popScope();
    });

    it('should capture an event', done => {
      pushScope(
        new BrowserClient({
          afterSend: (event: SentryEvent) => {
            expect(event.message).to.equal('test');
            expect(event.exception).to.be.undefined;
            done();
          },
          dsn,
        }),
      );
      captureEvent({ message: 'test' });
      popScope();
    });
  });
});
