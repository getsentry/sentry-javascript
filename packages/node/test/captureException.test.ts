import { SentryEvent } from '@sentry/core';
import { expect } from 'chai';
import { stub } from 'sinon';
import { NodeBackend, NodeFrontend } from '../src';

const TEST_DSN = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

// Note that these must be seperate files due to how sinon stubs things
// We would otherwise have a race conditon
describe('SentryNode', () => {
  describe('captureException', () => {
    it('should capture an exception', async () => {
      const frontend = new NodeFrontend({ dsn: TEST_DSN });
      // tslint:disable-next-line:no-unsafe-any
      const backend = (frontend as any).getBackend() as NodeBackend;
      await frontend.install();
      const sendEventStub = stub(backend, 'sendEvent');
      sendEventStub.callsFake(async (event: SentryEvent) => {
        expect(event.message).to.equal('Error: test2');
        expect(event.exception).to.not.be.undefined;
        expect(event.exception![0]).to.not.be.undefined;
        expect(event.exception![0].type).to.equal('Error');
        expect(event.exception![0].value).to.equal('test');
        expect(event.exception![0].stacktrace).to.not.be.empty;
        return Promise.resolve(200);
      });
      try {
        throw new Error('test');
      } catch (e) {
        await frontend.captureException(e);
      }
      expect(sendEventStub.calledOnce);
    });
  });
});
