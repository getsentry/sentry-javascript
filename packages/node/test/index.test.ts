import { expect } from 'chai';
import * as domain from 'domain';
import * as RavenNode from 'raven';
import { spy, stub } from 'sinon';

// -----------------------------------------------------------------------------
// It's important that we stub this before we import the backend
stub(RavenNode as any, 'send').callsFake((_: SentryEvent, cb: () => void) => {
  cb();
});
// -----------------------------------------------------------------------------

import {
  addBreadcrumb,
  captureEvent,
  captureException,
  captureMessage,
  configureScope,
  Context,
  init,
  NodeBackend,
  NodeClient,
  popScope,
  pushScope,
  ScopeInstance,
  SentryEvent,
} from '../src';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

describe('SentryNode', () => {
  beforeEach(() => {
    init({ dsn });
  });

  describe('getContext() / setContext()', () => {
    let s: sinon.SinonSpy;

    beforeEach(() => {
      s = spy(NodeClient.prototype, 'setContext');
    });

    afterEach(() => {
      s.restore();
    });

    it('should store/load extra', async () => {
      configureScope((scope: ScopeInstance) => {
        scope.setExtraContext({ abc: { def: [1] } });
      });
      const context = s.getCall(0).args[0] as Context;
      expect(context).to.deep.equal({ extra: { abc: { def: [1] } } });
    });

    it('should store/load tags', async () => {
      configureScope((scope: ScopeInstance) => {
        scope.setTagsContext({ abc: 'def' });
      });
      const context = s.getCall(0).args[0] as Context;
      expect(context).to.deep.equal({ tags: { abc: 'def' } });
    });

    it('should store/load user', async () => {
      configureScope((scope: ScopeInstance) => {
        scope.setUserContext({ id: 'def' });
      });
      const context = s.getCall(0).args[0] as Context;
      expect(context).to.deep.equal({ user: { id: 'def' } });
    });
  });

  describe('breadcrumbs', () => {
    let s: sinon.SinonStub;

    beforeEach(() => {
      s = stub(NodeBackend.prototype, 'sendEvent').returns(
        Promise.resolve(200),
      );
    });

    afterEach(() => {
      s.restore();
    });

    it('should record auto breadcrumbs', done => {
      pushScope(
        new NodeClient({
          afterSend: (event: SentryEvent) => {
            expect(event.breadcrumbs!).to.have.lengthOf(3);
            done();
          },
          dsn,
        }),
      );

      addBreadcrumb({ message: 'test1' });

      // Simulates internal capture breadcrumb from raven
      RavenNode.captureBreadcrumb({
        category: 'console',
        level: 'warning',
        message: 'testy',
      });

      addBreadcrumb({ message: 'test2' });

      captureMessage('event');
    });
  });

  describe('capture', () => {
    let s: sinon.SinonStub;

    beforeEach(() => {
      s = stub(NodeBackend.prototype, 'sendEvent').returns(
        Promise.resolve(200),
      );
    });

    afterEach(() => {
      s.restore();
    });

    it('should capture an exception', done => {
      pushScope(
        new NodeClient({
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
        new NodeClient({
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
        new NodeClient({
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

    it('should capture an event in a domain', async () => {
      new Promise<void>(resolve => {
        const d = domain.create();
        d.run(() => {
          pushScope(
            new NodeClient({
              afterSend: (event: SentryEvent) => {
                expect(event.message).to.equal('test');
                expect(event.exception).to.be.undefined;
                resolve();
                d.exit();
              },
              dsn,
            }),
          );
          captureEvent({ message: 'test' });
          popScope();
        });
      });
    });
  });
});
