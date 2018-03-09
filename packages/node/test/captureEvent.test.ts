import { SentryEvent } from '@sentry/core';
import { expect } from 'chai';
import * as RavenNode from 'raven';
import { stub } from 'sinon';

const sendEventStub = stub(RavenNode as any, 'send').callsFake(
  (event: SentryEvent, cb: () => void) => {
    cb();
  },
);

import { NodeFrontend } from '../src';

const TEST_DSN = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

// Note that these must be seperate files due to how sinon stubs things
// We would otherwise have a race conditon
describe('SentryNode', () => {
  describe('captureEvent', () => {
    it('should capture an event', async () => {
      const frontend = new NodeFrontend({ dsn: TEST_DSN });
      await frontend.install();
      await frontend.captureEvent({ message: 'test' });
      expect(sendEventStub.calledThrice);
    });
  });
});
