import { Hub, Scope, Session } from '@sentry/hub';
import { Event, Severity, Span } from '@sentry/types';
import { logger, SentryError, SyncPromise } from '@sentry/utils';

import { TestBackend } from '../mocks/backend';
import { TestClient } from '../mocks/client';
import { TestIntegration } from '../mocks/integration';
import { FakeTransport } from '../mocks/transport';

const PUBLIC_DSN = 'https://username@domain/123';
// eslint-disable-next-line no-var
declare var global: any;

jest.mock('@sentry/utils', () => {
  const original = jest.requireActual('@sentry/utils');
  return {
    ...original,

    uuid4(): string {
      return '42';
    },
    getGlobalObject(): any {
      return {
        console: {
          log(): void {
            // no-empty
          },
          warn(): void {
            // no-empty
          },
          error(): void {
            // no-empty
          },
        },
      };
    },
    consoleSandbox(cb: () => any): any {
      return cb();
    },
    truncate(str: string): string {
      return str;
    },
    timestampWithMs(): number {
      return 2020;
    },
    dateTimestampInSeconds(): number {
      return 2020;
    },
  };
});

describe('BaseClient', () => {
  beforeEach(() => {
    TestBackend.sendEventCalled = undefined;
    TestBackend.instance = undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor() / getDsn()', () => {
    test('returns the Dsn', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      expect(client.getDsn()!.toString()).toBe(PUBLIC_DSN);
    });

    test('allows missing Dsn', () => {
      expect.assertions(1);
      const client = new TestClient({});
      expect(client.getDsn()).toBeUndefined();
    });

    test('throws with invalid Dsn', () => {
      expect.assertions(1);
      expect(() => new TestClient({ dsn: 'abc' })).toThrow(SentryError);
    });
  });

  describe('getOptions()', () => {
    test('returns the options', () => {
      expect.assertions(1);
      const options = { dsn: PUBLIC_DSN, test: true };
      const client = new TestClient(options);
      expect(client.getOptions()).toEqual(options);
    });
  });

  describe('getBreadcrumbs() / addBreadcrumb()', () => {
    test('adds a breadcrumb', () => {
      expect.assertions(1);
      const client = new TestClient({});
      const scope = new Scope();
      const hub = new Hub(client, scope);
      scope.addBreadcrumb({ message: 'hello' }, 100);
      hub.addBreadcrumb({ message: 'world' });
      expect((scope as any)._breadcrumbs[1].message).toBe('world');
    });

    test('adds a timestamp to new breadcrumbs', () => {
      expect.assertions(1);
      const client = new TestClient({});
      const scope = new Scope();
      const hub = new Hub(client, scope);
      scope.addBreadcrumb({ message: 'hello' }, 100);
      hub.addBreadcrumb({ message: 'world' });
      expect((scope as any)._breadcrumbs[1].timestamp).toBeGreaterThan(1);
    });

    test('discards breadcrumbs beyond maxBreadcrumbs', () => {
      expect.assertions(2);
      const client = new TestClient({ maxBreadcrumbs: 1 });
      const scope = new Scope();
      const hub = new Hub(client, scope);
      scope.addBreadcrumb({ message: 'hello' }, 100);
      hub.addBreadcrumb({ message: 'world' });
      expect((scope as any)._breadcrumbs.length).toBe(1);
      expect((scope as any)._breadcrumbs[0].message).toBe('world');
    });

    test('allows concurrent updates', () => {
      expect.assertions(1);
      const client = new TestClient({});
      const scope = new Scope();
      const hub = new Hub(client, scope);
      hub.addBreadcrumb({ message: 'hello' });
      hub.addBreadcrumb({ message: 'world' });
      expect((scope as any)._breadcrumbs).toHaveLength(2);
    });

    test('calls beforeBreadcrumb and adds the breadcrumb without any changes', () => {
      expect.assertions(1);
      const beforeBreadcrumb = jest.fn(breadcrumb => breadcrumb);
      const client = new TestClient({ beforeBreadcrumb });
      const scope = new Scope();
      const hub = new Hub(client, scope);
      hub.addBreadcrumb({ message: 'hello' });
      expect((scope as any)._breadcrumbs[0].message).toBe('hello');
    });

    test('calls beforeBreadcrumb and uses the new one', () => {
      expect.assertions(1);
      const beforeBreadcrumb = jest.fn(() => ({ message: 'changed' }));
      const client = new TestClient({ beforeBreadcrumb });
      const scope = new Scope();
      const hub = new Hub(client, scope);
      hub.addBreadcrumb({ message: 'hello' });
      expect((scope as any)._breadcrumbs[0].message).toBe('changed');
    });

    test('calls beforeBreadcrumb and discards the breadcrumb when returned null', () => {
      expect.assertions(1);
      const beforeBreadcrumb = jest.fn(() => null);
      const client = new TestClient({ beforeBreadcrumb });
      const scope = new Scope();
      const hub = new Hub(client, scope);
      hub.addBreadcrumb({ message: 'hello' });
      expect((scope as any)._breadcrumbs.length).toBe(0);
    });

    test('calls beforeBreadcrumb gets an access to a hint as a second argument', () => {
      expect.assertions(2);
      const beforeBreadcrumb = jest.fn((breadcrumb, hint) => ({ ...breadcrumb, data: hint.data }));
      const client = new TestClient({ beforeBreadcrumb });
      const scope = new Scope();
      const hub = new Hub(client, scope);
      hub.addBreadcrumb({ message: 'hello' }, { data: 'someRandomThing' });
      expect((scope as any)._breadcrumbs[0].message).toBe('hello');
      expect((scope as any)._breadcrumbs[0].data).toBe('someRandomThing');
    });
  });

  describe('captureException', () => {
    test('captures and sends exceptions', () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      client.captureException(new Error('test exception'));
      expect(TestBackend.instance!.event).toEqual({
        environment: 'production',
        event_id: '42',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'test exception',
            },
          ],
        },
        timestamp: 2020,
      });
    });

    test('allows for providing explicit scope', () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.setExtra('foo', 'wat');
      client.captureException(
        new Error('test exception'),
        {
          captureContext: {
            extra: {
              bar: 'wat',
            },
          },
        },
        scope,
      );
      expect(TestBackend.instance!.event).toEqual(
        expect.objectContaining({
          extra: {
            bar: 'wat',
            foo: 'wat',
          },
        }),
      );
    });

    test('allows for clearing data from existing scope if explicit one does so in a callback function', () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.setExtra('foo', 'wat');
      client.captureException(
        new Error('test exception'),
        {
          captureContext: s => {
            s.clear();
            s.setExtra('bar', 'wat');
            return s;
          },
        },
        scope,
      );
      expect(TestBackend.instance!.event).toEqual(
        expect.objectContaining({
          extra: {
            bar: 'wat',
          },
        }),
      );
    });
  });

  describe('captureMessage', () => {
    test('captures and sends messages', () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      client.captureMessage('test message');
      expect(TestBackend.instance!.event).toEqual({
        environment: 'production',
        event_id: '42',
        level: 'info',
        message: 'test message',
        timestamp: 2020,
      });
    });

    test('should call eventFromException if input to captureMessage is not a primitive', () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const spy = jest.spyOn(TestBackend.instance!, 'eventFromException');

      client.captureMessage('foo');
      client.captureMessage(null as any);
      client.captureMessage(undefined as any);
      client.captureMessage(1 as any);
      client.captureMessage(false as any);
      expect(spy.mock.calls.length).toEqual(0);

      client.captureMessage({} as any);
      client.captureMessage([] as any);
      expect(spy.mock.calls.length).toEqual(2);
    });

    test('allows for providing explicit scope', () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.setExtra('foo', 'wat');
      client.captureMessage(
        'test message',
        Severity.Warning,
        {
          captureContext: {
            extra: {
              bar: 'wat',
            },
          },
        },
        scope,
      );
      expect(TestBackend.instance!.event).toEqual(
        expect.objectContaining({
          extra: {
            bar: 'wat',
            foo: 'wat',
          },
          level: 'warning',
        }),
      );
    });
  });

  describe('captureEvent() / prepareEvent()', () => {
    test('skips when disabled', () => {
      expect.assertions(1);
      const client = new TestClient({ enabled: false, dsn: PUBLIC_DSN });
      const scope = new Scope();
      client.captureEvent({}, undefined, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('skips without a Dsn', () => {
      expect.assertions(1);
      const client = new TestClient({});
      const scope = new Scope();
      client.captureEvent({}, undefined, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('sends an event', () => {
      expect.assertions(2);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!.message).toBe('message');
      expect(TestBackend.instance!.event).toEqual({
        environment: 'production',
        event_id: '42',
        message: 'message',
        timestamp: 2020,
      });
    });

    test('does not overwrite existing timestamp', () => {
      expect.assertions(2);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      client.captureEvent({ message: 'message', timestamp: 1234 }, undefined, scope);
      expect(TestBackend.instance!.event!.message).toBe('message');
      expect(TestBackend.instance!.event).toEqual({
        environment: 'production',
        event_id: '42',
        message: 'message',
        timestamp: 1234,
      });
    });

    test('adds event_id from hint if available', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      client.captureEvent({ message: 'message' }, { event_id: 'wat' }, scope);
      expect(TestBackend.instance!.event!).toEqual({
        environment: 'production',
        event_id: 'wat',
        message: 'message',
        timestamp: 2020,
      });
    });

    test('sets default environment to `production` it none provided', () => {
      expect.assertions(1);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
      });
      const scope = new Scope();
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        environment: 'production',
        event_id: '42',
        message: 'message',
        timestamp: 2020,
      });
    });

    test('adds the configured environment', () => {
      expect.assertions(1);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        environment: 'env',
      });
      const scope = new Scope();
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        environment: 'env',
        event_id: '42',
        message: 'message',
        timestamp: 2020,
      });
    });

    test('allows for environment to be explicitly set to falsy value', () => {
      expect.assertions(1);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        environment: undefined,
      });
      const scope = new Scope();
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        environment: undefined,
        event_id: '42',
        message: 'message',
        timestamp: 2020,
      });
    });

    test('adds the configured release', () => {
      expect.assertions(1);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        release: 'v1.0.0',
      });
      const scope = new Scope();
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        environment: 'production',
        event_id: '42',
        message: 'message',
        release: 'v1.0.0',
        timestamp: 2020,
      });
    });

    test('adds breadcrumbs', () => {
      expect.assertions(4);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'breadcrumb' }, 100);
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toHaveProperty('event_id', '42');
      expect(TestBackend.instance!.event!).toHaveProperty('message', 'message');
      expect(TestBackend.instance!.event!).toHaveProperty('breadcrumbs');
      expect(TestBackend.instance!.event!.breadcrumbs![0]).toHaveProperty('message', 'breadcrumb');
    });

    test('limits previously saved breadcrumbs', () => {
      expect.assertions(2);
      const client = new TestClient({ dsn: PUBLIC_DSN, maxBreadcrumbs: 1 });
      const scope = new Scope();
      const hub = new Hub(client, scope);
      hub.addBreadcrumb({ message: '1' });
      hub.addBreadcrumb({ message: '2' });
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!.breadcrumbs).toHaveLength(1);
      expect(TestBackend.instance!.event!.breadcrumbs![0].message).toEqual('2');
    });

    test('adds context data', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.setExtra('b', 'b');
      scope.setTag('a', 'a');
      scope.setUser({ id: 'user' });
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        environment: 'production',
        event_id: '42',
        extra: { b: 'b' },
        message: 'message',
        tags: { a: 'a' },
        timestamp: 2020,
        user: { id: 'user' },
      });
    });

    test('adds fingerprint', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.setFingerprint(['abcd']);
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        environment: 'production',
        event_id: '42',
        fingerprint: ['abcd'],
        message: 'message',
        timestamp: 2020,
      });
    });

    test('adds installed integrations to sdk info', () => {
      const client = new TestClient({ dsn: PUBLIC_DSN, integrations: [new TestIntegration()] });
      client.setupIntegrations();
      client.captureEvent({ message: 'message' });
      expect(TestBackend.instance!.event!.sdk).toEqual({
        integrations: ['TestIntegration'],
      });
    });

    test('normalizes event with default depth of 3', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const fourLevelsObject = {
        a: {
          b: {
            c: 'wat',
            d: {
              e: 'wat',
            },
          },
        },
      };
      const normalizedObject = {
        a: {
          b: {
            c: 'wat',
            d: '[Object]',
          },
        },
      };
      const fourLevelBreadcrumb = {
        data: fourLevelsObject,
        message: 'wat',
      };
      const normalizedBreadcrumb = {
        data: normalizedObject,
        message: 'wat',
      };
      client.captureEvent({
        breadcrumbs: [fourLevelBreadcrumb, fourLevelBreadcrumb, fourLevelBreadcrumb],
        contexts: fourLevelsObject,
        extra: fourLevelsObject,
        user: fourLevelsObject,
      });
      expect(TestBackend.instance!.event!).toEqual({
        breadcrumbs: [normalizedBreadcrumb, normalizedBreadcrumb, normalizedBreadcrumb],
        contexts: normalizedObject,
        environment: 'production',
        event_id: '42',
        extra: normalizedObject,
        timestamp: 2020,
        user: normalizedObject,
      });
    });

    test('normalization respects `normalizeDepth` option', () => {
      expect.assertions(1);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        normalizeDepth: 2,
      });
      const fourLevelsObject = {
        a: {
          b: {
            c: 'wat',
            d: {
              e: 'wat',
            },
          },
        },
      };
      const normalizedObject = {
        a: {
          b: '[Object]',
        },
      };
      const fourLevelBreadcrumb = {
        data: fourLevelsObject,
        message: 'wat',
      };
      const normalizedBreadcrumb = {
        data: normalizedObject,
        message: 'wat',
      };
      client.captureEvent({
        breadcrumbs: [fourLevelBreadcrumb, fourLevelBreadcrumb, fourLevelBreadcrumb],
        contexts: fourLevelsObject,
        extra: fourLevelsObject,
        user: fourLevelsObject,
      });
      expect(TestBackend.instance!.event!).toEqual({
        breadcrumbs: [normalizedBreadcrumb, normalizedBreadcrumb, normalizedBreadcrumb],
        contexts: normalizedObject,
        environment: 'production',
        event_id: '42',
        extra: normalizedObject,
        timestamp: 2020,
        user: normalizedObject,
      });
    });

    test('skips normalization when `normalizeDepth: 0`', () => {
      expect.assertions(1);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        normalizeDepth: 0,
      });
      const fourLevelsObject = {
        a: {
          b: {
            c: 'wat',
            d: {
              e: 'wat',
            },
          },
        },
      };
      const normalizedObject = {
        a: {
          b: {
            c: 'wat',
            d: {
              e: 'wat',
            },
          },
        },
      };
      const fourLevelBreadcrumb = {
        data: fourLevelsObject,
        message: 'wat',
      };
      const normalizedBreadcrumb = {
        data: normalizedObject,
        message: 'wat',
      };
      client.captureEvent({
        breadcrumbs: [fourLevelBreadcrumb, fourLevelBreadcrumb, fourLevelBreadcrumb],
        contexts: fourLevelsObject,
        extra: fourLevelsObject,
        user: fourLevelsObject,
      });
      expect(TestBackend.instance!.event!).toEqual({
        breadcrumbs: [normalizedBreadcrumb, normalizedBreadcrumb, normalizedBreadcrumb],
        contexts: normalizedObject,
        environment: 'production',
        event_id: '42',
        extra: normalizedObject,
        timestamp: 2020,
        user: normalizedObject,
      });
    });

    test('normalization applies to Transaction and Span consistently', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const transaction: Event = {
        contexts: {
          trace: {
            data: { _sentry_web_vitals: { LCP: { value: 99.9 } } },
            op: 'pageload',
            span_id: 'a3df84a60c2e4e76',
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          },
        },
        environment: 'production',
        event_id: '972f45b826a248bba98e990878a177e1',
        spans: [
          ({
            data: { _sentry_extra_metrics: { M1: { value: 1 }, M2: { value: 2 } } },
            description: 'first-paint',
            endTimestamp: 1591603196.637835,
            op: 'paint',
            parentSpanId: 'a3df84a60c2e4e76',
            spanId: '9e15bf99fbe4bc80',
            startTimestamp: 1591603196.637835,
            traceId: '86f39e84263a4de99c326acab3bfe3bd',
          } as unknown) as Span,
          ({
            description: 'first-contentful-paint',
            endTimestamp: 1591603196.637835,
            op: 'paint',
            parentSpanId: 'a3df84a60c2e4e76',
            spanId: 'aa554c1f506b0783',
            startTimestamp: 1591603196.637835,
            traceId: '86f39e84263a4de99c326acab3bfe3bd',
          } as any) as Span,
        ],
        start_timestamp: 1591603196.614865,
        timestamp: 1591603196.728485,
        transaction: '/',
        type: 'transaction',
      };
      // To be consistent, normalization could apply either to both transactions
      // and spans, or to none. So far the decision is to skip normalization for
      // both, such that the expected normalizedTransaction is the same as the
      // input transaction.
      const normalizedTransaction = JSON.parse(JSON.stringify(transaction)); // deep-copy
      client.captureEvent(transaction);
      expect(TestBackend.instance!.event!).toEqual(normalizedTransaction);
    });

    test('calls beforeSend and uses original event without any changes', () => {
      expect.assertions(1);
      const beforeSend = jest.fn(event => event);
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      client.captureEvent({ message: 'hello' });
      expect(TestBackend.instance!.event!.message).toBe('hello');
    });

    test('calls beforeSend and uses the new one', () => {
      expect.assertions(1);
      const beforeSend = jest.fn(() => ({ message: 'changed1' }));
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      client.captureEvent({ message: 'hello' });
      expect(TestBackend.instance!.event!.message).toBe('changed1');
    });

    test('calls beforeSend and discards the event', () => {
      expect.assertions(3);
      const beforeSend = jest.fn(() => null);
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      const captureExceptionSpy = jest.spyOn(client, 'captureException');
      const loggerErrorSpy = jest.spyOn(logger, 'error');
      client.captureEvent({ message: 'hello' });
      expect(TestBackend.instance!.event).toBeUndefined();
      expect(captureExceptionSpy).not.toBeCalled();
      expect(loggerErrorSpy).toBeCalledWith(new SentryError('`beforeSend` returned `null`, will not send event.'));
    });

    test('calls beforeSend and log info about invalid return value', () => {
      const invalidValues = [undefined, false, true, [], 1];
      expect.assertions(invalidValues.length * 2);

      for (const val of invalidValues) {
        const beforeSend = jest.fn(() => val);
        // @ts-ignore we need to test regular-js behavior
        const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
        const loggerErrorSpy = jest.spyOn(logger, 'error');
        client.captureEvent({ message: 'hello' });
        expect(TestBackend.instance!.event).toBeUndefined();
        expect(loggerErrorSpy).toBeCalledWith(
          new SentryError('`beforeSend` method has to return `null` or a valid event.'),
        );
      }
    });

    test('calls async beforeSend and uses original event without any changes', done => {
      jest.useFakeTimers();
      expect.assertions(1);
      const beforeSend = jest.fn(
        async event =>
          new Promise<Event>(resolve => {
            setTimeout(() => {
              resolve(event);
            }, 1);
          }),
      );
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      client.captureEvent({ message: 'hello' });
      jest.runOnlyPendingTimers();
      TestBackend.sendEventCalled = (event: Event) => {
        expect(event.message).toBe('hello');
      };
      setTimeout(() => {
        done();
      }, 5);
      jest.runOnlyPendingTimers();
    });

    test('calls async beforeSend and uses the new one', done => {
      jest.useFakeTimers();
      expect.assertions(1);
      const beforeSend = jest.fn(
        async () =>
          new Promise<Event>(resolve => {
            setTimeout(() => {
              resolve({ message: 'changed2' });
            }, 1);
          }),
      );

      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      client.captureEvent({ message: 'hello' });
      jest.runOnlyPendingTimers();
      TestBackend.sendEventCalled = (event: Event) => {
        expect(event.message).toBe('changed2');
      };
      setTimeout(() => {
        done();
      }, 5);
      jest.runOnlyPendingTimers();
    });

    test('calls async beforeSend and discards the event', () => {
      jest.useFakeTimers();
      expect.assertions(1);
      const beforeSend = jest.fn(
        async () =>
          new Promise<null>(resolve => {
            setTimeout(() => {
              resolve(null);
            });
          }),
      );
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      client.captureEvent({ message: 'hello' });
      jest.runAllTimers();
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('calls beforeSend gets an access to a hint as a second argument', () => {
      expect.assertions(2);
      const beforeSend = jest.fn((event, hint) => ({ ...event, data: hint.data }));
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      client.captureEvent({ message: 'hello' }, { data: 'someRandomThing' });
      expect(TestBackend.instance!.event!.message).toBe('hello');
      expect((TestBackend.instance!.event! as any).data).toBe('someRandomThing');
    });

    test('eventProcessor can drop the even when it returns null', () => {
      expect.assertions(3);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const captureExceptionSpy = jest.spyOn(client, 'captureException');
      const loggerErrorSpy = jest.spyOn(logger, 'error');
      const scope = new Scope();
      scope.addEventProcessor(() => null);
      client.captureEvent({ message: 'hello' }, {}, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
      expect(captureExceptionSpy).not.toBeCalled();
      expect(loggerErrorSpy).toBeCalledWith(new SentryError('An event processor returned null, will not send event.'));
    });

    test('eventProcessor sends an event and logs when it crashes', () => {
      expect.assertions(3);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const captureExceptionSpy = jest.spyOn(client, 'captureException');
      const loggerErrorSpy = jest.spyOn(logger, 'error');
      const scope = new Scope();
      const exception = new Error('sorry');
      scope.addEventProcessor(() => {
        throw exception;
      });
      client.captureEvent({ message: 'hello' }, {}, scope);
      expect(TestBackend.instance!.event!.exception!.values![0]).toStrictEqual({ type: 'Error', value: 'sorry' });
      expect(captureExceptionSpy).toBeCalledWith(exception, {
        data: {
          __sentry__: true,
        },
        originalException: exception,
      });
      expect(loggerErrorSpy).toBeCalledWith(
        new SentryError(
          `Event processing pipeline threw an error, original event will not be sent. Details have been sent as a new event.\nReason: ${exception}`,
        ),
      );
    });
  });

  describe('integrations', () => {
    beforeEach(() => {
      global.__SENTRY__ = {};
    });

    test('setup each one of them on setupIntegration call', () => {
      expect.assertions(2);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        integrations: [new TestIntegration()],
      });
      client.setupIntegrations();
      expect(Object.keys((client as any)._integrations).length).toBe(1);
      expect(client.getIntegration(TestIntegration)).toBeTruthy();
    });

    test('skips installation if DSN is not provided', () => {
      expect.assertions(2);
      const client = new TestClient({
        integrations: [new TestIntegration()],
      });
      client.setupIntegrations();
      expect(Object.keys((client as any)._integrations).length).toBe(0);
      expect(client.getIntegration(TestIntegration)).toBeFalsy();
    });

    test('skips installation if enabled is set to false', () => {
      expect.assertions(2);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        enabled: false,
        integrations: [new TestIntegration()],
      });
      client.setupIntegrations();
      expect(Object.keys((client as any)._integrations).length).toBe(0);
      expect(client.getIntegration(TestIntegration)).toBeFalsy();
    });
  });

  describe('flush/close', () => {
    test('flush', async () => {
      jest.useRealTimers();
      expect.assertions(5);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        enableSend: true,
        transport: FakeTransport,
      });

      const delay = 1;
      const transportInstance = (client as any)._getBackend().getTransport() as FakeTransport;
      transportInstance.delay = delay;

      client.captureMessage('test');
      expect(transportInstance).toBeInstanceOf(FakeTransport);
      expect(transportInstance.sendCalled).toEqual(1);
      expect(transportInstance.sentCount).toEqual(0);
      await client.flush(delay);
      expect(transportInstance.sentCount).toEqual(1);
      expect(transportInstance.sendCalled).toEqual(1);
    });

    test('flush with some events being processed async', async () => {
      jest.useRealTimers();
      expect.assertions(5);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        enableSend: true,
        transport: FakeTransport,
      });

      const delay = 300;
      const spy = jest.spyOn(TestBackend.instance!, 'eventFromMessage');
      spy.mockImplementationOnce(
        (message, level) =>
          new SyncPromise(resolve => {
            setTimeout(() => resolve({ message, level }), 150);
          }),
      );
      const transportInstance = (client as any)._getBackend().getTransport() as FakeTransport;
      transportInstance.delay = delay;

      client.captureMessage('test async');
      client.captureMessage('test non-async');
      expect(transportInstance).toBeInstanceOf(FakeTransport);
      expect(transportInstance.sendCalled).toEqual(1);
      expect(transportInstance.sentCount).toEqual(0);
      await client.flush(delay);
      expect(transportInstance.sentCount).toEqual(2);
      expect(transportInstance.sendCalled).toEqual(2);
      spy.mockRestore();
    });

    test('close', async () => {
      jest.useRealTimers();
      expect.assertions(2);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        enableSend: true,
        transport: FakeTransport,
      });

      const delay = 1;
      const transportInstance = (client as any)._getBackend().getTransport() as FakeTransport;
      transportInstance.delay = delay;

      expect(client.captureMessage('test')).toBeTruthy();
      await client.close(delay);
      // Sends after close shouldn't work anymore
      expect(client.captureMessage('test')).toBeFalsy();
    });

    test('multiple concurrent flush calls should just work', async () => {
      jest.useRealTimers();
      expect.assertions(3);

      const client = new TestClient({ dsn: PUBLIC_DSN });

      return Promise.all([
        client.flush(1).then(() => {
          expect(true).toEqual(true);
        }),
        client.flush(1).then(() => {
          expect(true).toEqual(true);
        }),
        client.flush(1).then(() => {
          expect(true).toEqual(true);
        }),
      ]);
    });
  });

  describe('captureSession()', () => {
    test('sends sessions to the backend', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const session = new Session({ release: 'test' });
      client.captureSession(session);
      expect(TestBackend.instance!.session).toEqual(session);
    });

    test('skips when disabled', () => {
      expect.assertions(1);
      const client = new TestClient({ enabled: false, dsn: PUBLIC_DSN });
      const session = new Session({ release: 'test' });
      client.captureSession(session);
      expect(TestBackend.instance!.session).toBeUndefined();
    });
  });
});
