import { SentryEvent } from '@sentry/core';
import { expect } from 'chai';
import * as RavenJS from 'raven-js';
import { spy, stub } from 'sinon';
import { BrowserBackend, BrowserFrontend, SentryClient } from '../src';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

describe('SentryBrowser', () => {
  beforeEach(async () => {
    await SentryClient.create({ dsn });
  });

  describe('getContext() / setContext()', () => {
    it('should store/load extra', async () => {
      await SentryClient.setContext({ extra: { abc: { def: [1] } } });
      const context = await SentryClient.getContext();
      expect(context).to.deep.equal({ extra: { abc: { def: [1] } } });
    });

    it('should store/load tags', async () => {
      await SentryClient.setContext({ tags: { abc: 'def' } });
      const context = await SentryClient.getContext();
      expect(context).to.deep.equal({ tags: { abc: 'def' } });
    });

    it('should store/load user', async () => {
      await SentryClient.setContext({ user: { id: 'def' } });
      const context = await SentryClient.getContext();
      expect(context).to.deep.equal({ user: { id: 'def' } });
    });
  });

  describe('breadcrumbs', () => {
    it('should store breadcrumbs', async () => {
      await SentryClient.create({ dsn });
      await SentryClient.addBreadcrumb({ message: 'test' });
    });

    it('should record auto breadcrumbs', async () => {
      new Promise<void>(async resolve => {
        const frontend = new BrowserFrontend({
          dsn,
        });
        await frontend.install();

        // tslint:disable-next-line:no-unsafe-any
        const backend = (frontend as any).getBackend() as BrowserBackend;

        const sendEventStub = stub(backend, 'sendEvent');

        sendEventStub.callsFake(async (event: SentryEvent) => {
          expect(event.breadcrumbs!).to.have.lengthOf(3);
          resolve();
          return Promise.resolve(200);
        });

        await frontend.addBreadcrumb({ message: 'test1' });

        // Simulates internal capture breadcrumb from raven
        RavenJS.captureBreadcrumb({
          category: 'console',
          level: 'warning',
          message: 'testy',
        });

        await frontend.addBreadcrumb({ message: 'test2' });

        await frontend.captureMessage('event');
      });
    });
  });

  describe('capture', () => {
    it('should capture an exception', async () => {
      const afterSend = spy();
      const frontend = new BrowserFrontend({
        afterSend,
        dsn,
      });
      // tslint:disable-next-line:no-unsafe-any
      const backend = (frontend as any).getBackend() as BrowserBackend;
      await frontend.install();
      const sendEventStub = stub(backend, 'sendEvent');
      sendEventStub.returns(Promise.resolve(200));
      try {
        throw new Error('test');
      } catch (e) {
        await frontend.captureException(e);
        const event = afterSend.getCall(0).args[0] as SentryEvent;
        expect(event.exception).to.not.be.undefined;
        expect(event.exception![0]).to.not.be.undefined;
        expect(event.exception![0].type).to.equal('Error');
        expect(event.exception![0].value).to.equal('test');
        expect(event.exception![0].stacktrace).to.not.be.empty;
      }
    });

    it('should capture a message', async () => {
      const afterSend = spy();
      const frontend = new BrowserFrontend({
        afterSend,
        dsn,
      });
      // tslint:disable-next-line:no-unsafe-any
      const backend = (frontend as any).getBackend() as BrowserBackend;
      await frontend.install();
      const sendEventStub = stub(backend, 'sendEvent');
      sendEventStub.returns(Promise.resolve(200));
      await frontend.captureMessage('test');
      const event = afterSend.getCall(0).args[0] as SentryEvent;
      expect(event.message).to.equal('test');
      expect(event.exception).to.be.undefined;
    });

    it('should capture an event', async () => {
      const afterSend = spy();
      const frontend = new BrowserFrontend({
        afterSend,
        dsn,
      });
      await frontend.install();
      await frontend.captureEvent({ message: 'test' });
      const event = afterSend.getCall(0).args[0] as SentryEvent;
      expect(event.message).to.equal('test');
    });
  });
});
