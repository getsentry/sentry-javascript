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
  Scope,
} from '../src';
import { NodeBackend } from '../src/backend';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

// eslint-disable-next-line no-var
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
      expect(global.__SENTRY__.hub._stack[1].scope._extra).toEqual({
        abc: { def: [1] },
      });
    });

    test('store/load tags', async () => {
      configureScope((scope: Scope) => {
        scope.setTag('abc', 'def');
      });
      expect(global.__SENTRY__.hub._stack[1].scope._tags).toEqual({
        abc: 'def',
      });
    });

    test('store/load user', async () => {
      configureScope((scope: Scope) => {
        scope.setUser({ id: 'def' });
      });
      expect(global.__SENTRY__.hub._stack[1].scope._user).toEqual({
        id: 'def',
      });
    });
  });

  describe('breadcrumbs', () => {
    let s: jest.SpyInstance<void, Event[]>;

    beforeEach(() => {
      s = jest.spyOn(NodeBackend.prototype, 'sendEvent').mockImplementation(async () => Promise.resolve({ code: 200 }));
    });

    afterEach(() => {
      s.mockRestore();
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
    let s: jest.SpyInstance<void, Event[]>;

    beforeEach(() => {
      s = jest.spyOn(NodeBackend.prototype, 'sendEvent').mockImplementation(async () => Promise.resolve({ code: 200 }));
    });

    afterEach(() => {
      s.mockRestore();
    });

    test('capture an exception', done => {
      expect.assertions(6);
      getCurrentHub().bindClient(
        new NodeClient({
          beforeSend: (event: Event) => {
            expect(event.tags).toEqual({ test: '1' });
            expect(event.exception).not.toBeUndefined();
            expect(event.exception!.values![0]).not.toBeUndefined();
            expect(event.exception!.values![0].stacktrace!).not.toBeUndefined();
            expect(event.exception!.values![0].stacktrace!.frames![2]).not.toBeUndefined();
            expect(event.exception!.values![0].value).toEqual('test');
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

    test('capture a string exception', done => {
      expect.assertions(6);
      getCurrentHub().bindClient(
        new NodeClient({
          beforeSend: (event: Event) => {
            expect(event.tags).toEqual({ test: '1' });
            expect(event.exception).not.toBeUndefined();
            expect(event.exception!.values![0]).not.toBeUndefined();
            expect(event.exception!.values![0].stacktrace!).not.toBeUndefined();
            expect(event.exception!.values![0].stacktrace!.frames![2]).not.toBeUndefined();
            expect(event.exception!.values![0].value).toEqual('test string exception');
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
        throw 'test string exception';
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
        // @ts-ignore allow function declarations in strict mode
        // eslint-disable-next-line no-inner-declarations
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

describe('SentryNode initialization', () => {
  test('global.SENTRY_RELEASE is used to set release on initialization if available', () => {
    global.SENTRY_RELEASE = { id: 'foobar' };
    init({ dsn });
    expect(global.__SENTRY__.hub._stack[0].client.getOptions().release).toEqual('foobar');
    // Unsure if this is needed under jest.
    global.SENTRY_RELEASE = undefined;
  });
  test('initialization proceeds as normal if global.SENTRY_RELEASE is not set', () => {
    // This is mostly a happy-path test to ensure that the initialization doesn't throw an error.
    init({ dsn });
    expect(global.__SENTRY__.hub._stack[0].client.getOptions().release).toBeUndefined();
  });
});
