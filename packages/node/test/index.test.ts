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
  getMainHub,
  init,
  NodeBackend,
  NodeClient,
  Scope,
  SentryEvent,
} from '../src';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

declare var global: any;

describe('SentryNode', () => {
  beforeAll(() => {
    init({ dsn });
  });

  beforeEach(() => {
    getMainHub().pushScope();
  });

  afterEach(() => {
    getMainHub().popScope();
  });

  describe('getContext() / setContext()', () => {
    test('store/load extra', async () => {
      configureScope((scope: Scope) => {
        scope.setExtra('abc', { def: [1] });
      });
      expect(global.__SENTRY__.hub.stack[1].scope.extra).toEqual({
        abc: { def: [1] },
      });
    });

    test('store/load tags', async () => {
      configureScope((scope: Scope) => {
        scope.setTag('abc', 'def');
      });
      expect(global.__SENTRY__.hub.stack[1].scope.tags).toEqual({
        abc: 'def',
      });
    });

    test('store/load user', async () => {
      configureScope((scope: Scope) => {
        scope.setUser({ id: 'def' });
      });
      expect(global.__SENTRY__.hub.stack[1].scope.user).toEqual({
        id: 'def',
      });
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
      getMainHub().pushScope();
      getMainHub().bindClient(
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
      getMainHub().pushScope();
      getMainHub().bindClient(
        new NodeClient({
          afterSend: (event: SentryEvent) => {
            expect(event.tags).toEqual({ test: '1' });
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
      configureScope((scope: Scope) => {
        scope.setTag('test', '1');
      });
      try {
        throw new Error('test');
      } catch (e) {
        captureException(e);
      }
      getMainHub().popScope();
    });

    test('capture a message', done => {
      getMainHub().pushScope();
      getMainHub().bindClient(
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
      getMainHub().popScope();
    });

    test('capture an event', done => {
      getMainHub().pushScope();
      getMainHub().bindClient(
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
      getMainHub().popScope();
    });

    test('capture an event in a domain', async () => {
      new Promise<void>(resolve => {
        const d = domain.create();
        d.run(() => {
          getMainHub().pushScope();
          getMainHub().bindClient(
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
          getMainHub().popScope();
        });
      });
    });
  });
});
