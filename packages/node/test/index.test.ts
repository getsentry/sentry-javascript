import * as domain from 'domain';

import {
  addBreadcrumb,
  captureEvent,
  captureException,
  captureMessage,
  configureScope,
  getCurrentHub,
  init,
  NodeBackend,
  NodeClient,
  Scope,
  SentryEvent,
  SentryResponse,
} from '../src';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

declare var global: any;

describe('SentryNode', () => {
  beforeAll(() => {
    init({ dsn });
  });

  beforeEach(() => {
    getCurrentHub().pushScope();
  });

  afterEach(() => {
    getCurrentHub().popScope();
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
    let s: jest.Mock<(event: SentryEvent) => Promise<SentryResponse>>;

    beforeEach(() => {
      s = jest.spyOn(NodeBackend.prototype, 'sendEvent').mockImplementation(async () => Promise.resolve({ code: 200 }));
    });

    afterEach(() => {
      s.mockReset();
    });

    test('record auto breadcrumbs', done => {
      getCurrentHub().pushScope();
      const client = new NodeClient({
        beforeSend: (event: SentryEvent) => {
          // TODO: It should be 3, but we don't capture a breadcrumb
          // for our own captureMessage/captureException calls yet
          expect(event.breadcrumbs!).toHaveLength(2);
          done();
          return event;
        },
        dsn,
      });
      client.install();
      getCurrentHub().bindClient(client);
      addBreadcrumb({ message: 'test1' });
      addBreadcrumb({ message: 'test2' });
      captureMessage('event');
    });
  });

  describe('capture', () => {
    let s: jest.Mock<(event: SentryEvent) => Promise<SentryResponse>>;

    beforeEach(() => {
      s = jest.spyOn(NodeBackend.prototype, 'sendEvent').mockImplementation(async () => Promise.resolve({ code: 200 }));
    });

    afterEach(() => {
      s.mockReset();
    });

    test('capture an exception', done => {
      expect.assertions(6);
      getCurrentHub().pushScope();
      getCurrentHub().bindClient(
        new NodeClient({
          beforeSend: (event: SentryEvent) => {
            expect(event.tags).toEqual({ test: '1' });
            expect(event.exception).not.toBeUndefined();
            expect(event.exception!.values[0]).not.toBeUndefined();
            expect(event.exception!.values[0].type).toBe('Error');
            expect(event.exception!.values[0].value).toBe('test');
            expect(event.exception!.values[0].stacktrace).toBeTruthy();
            done();
            return event;
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
      getCurrentHub().popScope();
    });

    test('capture a message', done => {
      expect.assertions(2);
      getCurrentHub().pushScope();
      getCurrentHub().bindClient(
        new NodeClient({
          beforeSend: (event: SentryEvent) => {
            expect(event.message).toBe('test');
            expect(event.exception).toBeUndefined();
            done();
            return event;
          },
          dsn,
        }),
      );
      captureMessage('test');
      getCurrentHub().popScope();
    });

    test('capture an event', done => {
      expect.assertions(2);
      getCurrentHub().pushScope();
      getCurrentHub().bindClient(
        new NodeClient({
          beforeSend: (event: SentryEvent) => {
            expect(event.message).toBe('test');
            expect(event.exception).toBeUndefined();
            done();
            return event;
          },
          dsn,
        }),
      );
      captureEvent({ message: 'test' });
      getCurrentHub().popScope();
    });

    test('capture an event in a domain', async () =>
      new Promise<void>(resolve => {
        const d = domain.create();
        const client = new NodeClient({
          beforeSend: (event: SentryEvent) => {
            expect(event.message).toBe('test');
            expect(event.exception).toBeUndefined();
            resolve();
            d.exit();
            return event;
          },
          dsn,
        });
        d.run(() => {
          getCurrentHub().bindClient(client);
          expect(getCurrentHub().getClient()).toBe(client);
          getCurrentHub().captureEvent({ message: 'test' });
        });
      }));
  });
});
