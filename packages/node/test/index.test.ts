import * as domain from 'domain';
import * as RavenNode from 'raven';

// -----------------------------------------------------------------------------
// It's important that we stub this before we import the backend
jest
  .spyOn(RavenNode as any, 'send')
  .mockImplementation((_: SentryEvent, cb: () => void) => {
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
  Scope,
  SentryEvent,
} from '../src';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

describe('SentryNode', () => {
  beforeEach(() => {
    init({ dsn });
  });

  describe('getContext() / setContext()', () => {
    let s: jest.SpyInstance;

    beforeEach(() => {
      s = jest.spyOn(NodeClient.prototype, 'setContext');
    });

    afterEach(() => {
      s.mockRestore();
    });

    test('store/load extra', async () => {
      configureScope((scope: Scope) => {
        scope.setExtra({ abc: { def: [1] } });
      });
      const context = s.mock.calls[0][0] as Context;
      expect(context).toEqual({ extra: { abc: { def: [1] } } });
    });

    test('store/load tags', async () => {
      configureScope((scope: Scope) => {
        scope.setTags({ abc: 'def' });
      });
      const context = s.mock.calls[0][0] as Context;
      expect(context).toEqual({ tags: { abc: 'def' } });
    });

    test('store/load user', async () => {
      configureScope((scope: Scope) => {
        scope.setUser({ id: 'def' });
      });
      const context = s.mock.calls[0][0] as Context;
      expect(context).toEqual({ user: { id: 'def' } });
    });
  });

  describe('breadcrumbs', () => {
    let s: jest.Mock<(event: SentryEvent) => Promise<number>>;

    beforeEach(() => {
      s = jest
        .spyOn(NodeBackend.prototype, 'sendEvent')
        .mockImplementation(async () => Promise.resolve(200));
    });

    afterEach(() => {
      s.mockReset();
    });

    test('record auto breadcrumbs', done => {
      pushScope(
        new NodeClient({
          afterSend: (event: SentryEvent) => {
            expect(event.breadcrumbs!).toHaveLength(3);
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
    let s: jest.Mock<(event: SentryEvent) => Promise<number>>;

    beforeEach(() => {
      s = jest
        .spyOn(NodeBackend.prototype, 'sendEvent')
        .mockImplementation(async () => Promise.resolve(200));
    });

    afterEach(() => {
      s.mockReset();
    });

    test('capture an exception', done => {
      pushScope(
        new NodeClient({
          afterSend: (event: SentryEvent) => {
            expect(event.exception).not.toBeUndefined();
            expect(event.exception![0]).not.toBeUndefined();
            expect(event.exception![0].type).toBe('Error');
            expect(event.exception![0].value).toBe('test');
            expect(event.exception![0].stacktrace).toBeTruthy();
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

    test('capture a message', done => {
      pushScope(
        new NodeClient({
          afterSend: (event: SentryEvent) => {
            expect(event.message).toBe('test');
            expect(event.exception).toBeUndefined();
            done();
          },
          dsn,
        }),
      );
      captureMessage('test');
      popScope();
    });

    test('capture an event', done => {
      pushScope(
        new NodeClient({
          afterSend: (event: SentryEvent) => {
            expect(event.message).toBe('test');
            expect(event.exception).toBeUndefined();
            done();
          },
          dsn,
        }),
      );
      captureEvent({ message: 'test' });
      popScope();
    });

    test('capture an event in a domain', async () => {
      new Promise<void>(resolve => {
        const d = domain.create();
        d.run(() => {
          pushScope(
            new NodeClient({
              afterSend: (event: SentryEvent) => {
                expect(event.message).toBe('test');
                expect(event.exception).toBeUndefined();
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
