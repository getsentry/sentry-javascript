import { SentryEvent } from '@sentry/core';
import { expect } from 'chai';
import { stub } from 'sinon';
import { NodeBackend, NodeFrontend } from '../src';

const TEST_DSN = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

// Note that these must be seperate files due to how sinon stubs things
// We would otherwise have a race conditon
describe('SentryNode', () => {
  describe('captureMessage', () => {
    it('should capture a message', async () => {
      const frontend = new NodeFrontend({ dsn: TEST_DSN });
      // tslint:disable-next-line:no-unsafe-any
      const backend = (frontend as any).getBackend() as NodeBackend;
      await frontend.install();
      const sendEventStub = stub(backend, 'sendEvent');
      sendEventStub.callsFake(async (event: SentryEvent) => {
        expect(event.message).to.equal('test');
        expect(event.exception).to.be.undefined;
        return Promise.resolve(200);
      });
      await frontend.captureMessage('test');
      expect(sendEventStub.calledOnce);
    });
  });
});
