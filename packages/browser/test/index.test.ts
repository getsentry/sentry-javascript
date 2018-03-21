import { Context, SentryEvent } from '@sentry/core';
import { expect } from 'chai';
import * as RavenJS from 'raven-js';
import { spy, stub } from 'sinon';
import {
  addBreadcrumb,
  BrowserBackend,
  BrowserFrontend,
  captureEvent,
  captureException,
  captureMessage,
  create,
  popScope,
  pushScope,
  setExtraContext,
  setTagsContext,
  setUserContext,
} from '../src';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

describe('SentryBrowser', () => {
  before(() => {
    create({ dsn });
  });

  describe('getContext() / setContext()', () => {
    let s: sinon.SinonSpy;

    beforeEach(() => {
      s = spy(BrowserFrontend.prototype, 'setContext');
    });

    afterEach(() => {
      s.restore();
    });

    it('should store/load extra', () => {
      setExtraContext({ abc: { def: [1] } });
      const context = s.getCall(0).args[0] as Context;
      expect(context).to.deep.equal({ extra: { abc: { def: [1] } } });
    });

    it('should store/load tags', () => {
      setTagsContext({ abc: 'def' });
      const context = s.getCall(0).args[0] as Context;
      expect(context).to.deep.equal({ tags: { abc: 'def' } });
    });

    it('should store/load user', () => {
      setUserContext({ id: 'def' });
      const context = s.getCall(0).args[0] as Context;
      expect(context).to.deep.equal({ user: { id: 'def' } });
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
        new BrowserFrontend({
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
        new BrowserFrontend({
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
        new BrowserFrontend({
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
        new BrowserFrontend({
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
