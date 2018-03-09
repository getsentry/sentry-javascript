import { SentryEvent } from '@sentry/core';
import { expect } from 'chai';
import * as RavenNode from 'raven';
import { stub } from 'sinon';
import { NodeBackend, NodeFrontend } from '../src';

const TEST_DSN = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

describe('SentryNode', () => {
  describe('breadcrumbs', () => {
    it('should record auto breadcrumbs', async () => {
      const frontend = new NodeFrontend({
        // autoBreadcrumbs: { console: true },
        dsn: TEST_DSN,
      });
      await frontend.install();

      // tslint:disable-next-line:no-unsafe-any
      const backend = (frontend as any).getBackend() as NodeBackend;

      const sendEventStub = stub(backend, 'sendEvent');

      sendEventStub.callsFake(async (event: SentryEvent) => {
        expect(event.breadcrumbs!).to.have.lengthOf(3);
        return Promise.resolve(200);
      });

      await frontend.addBreadcrumb({ message: 'test1' });

      // Simulates internal capture breadcrumb from raven
      RavenNode.captureBreadcrumb({
        category: 'console',
        level: 'warning',
        message: 'testy',
      });

      await frontend.addBreadcrumb({ message: 'test2' });

      await frontend.captureMessage('event');

      expect(sendEventStub.calledOnce);
    });
  });
});
