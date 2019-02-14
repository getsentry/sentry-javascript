import * as domain from 'domain';
import {
  addBreadcrumb,
  captureEvent,
  captureException,
  captureMessage,
  configureScope,
  Event,
  getCurrentHub,
  init,
  NodeClient,
  Response,
  Scope,
} from '../src';
import { NodeBackend } from '../src/backend';
import { SetTimeoutTransport } from './helper/settimeouttransport';

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

  test('close() with to short timeout', done => {
    expect.assertions(1);
    jest.useFakeTimers();
    const client = new NodeClient({
      dsn,
      transport: SetTimeoutTransport,
    });
    getCurrentHub().bindClient(client);
    captureMessage('test');
    captureMessage('test');
    captureMessage('test');
    client
      .close(50)
      .then(result => {
        expect(result).toBeFalsy();
        done();
      })
      .catch(() => {
        // test
      });
    jest.runAllTimers();
  });

  test('close() with timeout', done => {
    expect.assertions(1);
    jest.useFakeTimers();
    const client = new NodeClient({
      dsn,
      transport: SetTimeoutTransport,
    });
    getCurrentHub().bindClient(client);
    captureMessage('test');
    captureMessage('test');
    captureMessage('test');
    jest.runAllTimers();
    client
      .close(50)
      .then(result => {
        expect(result).toBeFalsy();
        done();
      })
      .catch(() => {
        // test
      });
    jest.runAllTimers();
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
    let s: jest.Mock<(event: Event) => void>;

    beforeEach(() => {
      s = jest.spyOn(NodeBackend.prototype, 'sendEvent').mockImplementation(async () => Promise.resolve({ code: 200 }));
    });

    afterEach(() => {
      s.mockReset();
    });

    test('record auto breadcrumbs', done => {
      const client = new NodeClient({
        beforeSend: (event: Event) => {
          // TODO: It should be 3, but we don't capture a breadcrumb
          // for our own captureMessage/captureException calls yet
          expect(event.breadcrumbs!).toHaveLength(2);
          done();
          return null;
        },
        dsn,
      });
      getCurrentHub().bindClient(client);
      addBreadcrumb({ message: 'test1' });
      addBreadcrumb({ message: 'test2' });
      captureMessage('event');
    });
  });

  describe('capture', () => {
    let s: jest.Mock<(event: Event) => void>;

    beforeEach(() => {
      s = jest.spyOn(NodeBackend.prototype, 'sendEvent').mockImplementation(async () => Promise.resolve({ code: 200 }));
    });

    afterEach(() => {
      s.mockReset();
    });

    test('capture an exception', done => {
      expect.assertions(5);
      getCurrentHub().bindClient(
        new NodeClient({
          beforeSend: (event: Event) => {
            expect(event.tags).toEqual({ test: '1' });
            expect(event.exception).not.toBeUndefined();
            expect(event.exception!.values![0]).not.toBeUndefined();
            expect(event.exception!.values![0].stacktrace!).not.toBeUndefined();
            expect(event.exception!.values![0].stacktrace!.frames![2]).not.toBeUndefined();
            done();
            return null;
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
    });

    test('capture an exception no pre/post context', done => {
      expect.assertions(10);
      getCurrentHub().bindClient(
        new NodeClient({
          beforeSend: (event: Event) => {
            expect(event.tags).toEqual({ test: '1' });
            expect(event.exception).not.toBeUndefined();
            expect(event.exception!.values![0]).not.toBeUndefined();
            expect(event.exception!.values![0].stacktrace!).not.toBeUndefined();
            expect(event.exception!.values![0].stacktrace!.frames![2]).not.toBeUndefined();
            expect(event.exception!.values![0].stacktrace!.frames![2].pre_context).toBeUndefined();
            expect(event.exception!.values![0].stacktrace!.frames![2].post_context).toBeUndefined();
            expect(event.exception!.values![0].type).toBe('Error');
            expect(event.exception!.values![0].value).toBe('test');
            expect(event.exception!.values![0].stacktrace).toBeTruthy();
            done();
            return null;
          },
          dsn,
          frameContextLines: 0,
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
    });

    test('capture a message', done => {
      expect.assertions(2);
      getCurrentHub().bindClient(
        new NodeClient({
          beforeSend: (event: Event) => {
            expect(event.message).toBe('test');
            expect(event.exception).toBeUndefined();
            done();
            return null;
          },
          dsn,
        }),
      );
      captureMessage('test');
    });

    test('capture an event', done => {
      expect.assertions(2);
      getCurrentHub().bindClient(
        new NodeClient({
          beforeSend: (event: Event) => {
            expect(event.message).toBe('test event');
            expect(event.exception).toBeUndefined();
            done();
            return null;
          },
          dsn,
        }),
      );
      captureEvent({ message: 'test event' });
    });

    test('capture an event in a domain', done => {
      const d = domain.create();

      const client = new NodeClient({
        beforeSend: (event: Event) => {
          expect(event.message).toBe('test domain');
          expect(event.exception).toBeUndefined();
          done();
          return null;
        },
        dsn,
      });

      d.run(() => {
        getCurrentHub().bindClient(client);
        expect(getCurrentHub().getClient()).toBe(client);
        getCurrentHub().captureEvent({ message: 'test domain' });
      });
    });

    test('stacktrace order', done => {
      expect.assertions(1);
      getCurrentHub().bindClient(
        new NodeClient({
          beforeSend: (event: Event) => {
            expect(
              event.exception!.values![0].stacktrace!.frames![
                event.exception!.values![0].stacktrace!.frames!.length - 1
              ].function,
            ).toEqual('testy');
            done();
            return null;
          },
          dsn,
        }),
      );
      try {
        // @ts-ignore
        function testy(): void {
          throw new Error('test');
        }
        testy();
      } catch (e) {
        captureException(e);
      }
    });
  });
});
