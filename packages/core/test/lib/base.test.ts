import type { Client, Envelope, ErrorEvent, Event, TransactionEvent } from '@sentry/types';
import { SentryError, SyncPromise, dsnToString, logger } from '@sentry/utils';

import {
  Scope,
  addBreadcrumb,
  getCurrentScope,
  getIsolationScope,
  lastEventId,
  makeSession,
  setCurrentClient,
  withMonitor,
} from '../../src';
import * as integrationModule from '../../src/integration';
import { TestClient, getDefaultTestClientOptions } from '../mocks/client';
import { AdHocIntegration, TestIntegration } from '../mocks/integration';
import { makeFakeTransport } from '../mocks/transport';
import { clearGlobalScope } from './clear-global-scope';

const PUBLIC_DSN = 'https://username@domain/123';
// eslint-disable-next-line no-var
declare var global: any;

const clientEventFromException = jest.spyOn(TestClient.prototype, 'eventFromException');
const clientProcess = jest.spyOn(TestClient.prototype as any, '_process');

jest.mock('@sentry/utils', () => {
  const original = jest.requireActual('@sentry/utils');
  return {
    ...original,

    uuid4(): string {
      return '42';
    },
    GLOBAL_OBJ: {
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
    },
    consoleSandbox(cb: () => any): any {
      return cb();
    },
    truncate(str: string): string {
      return str;
    },
    dateTimestampInSeconds(): number {
      return 2020;
    },
  };
});

describe('BaseClient', () => {
  beforeEach(() => {
    TestClient.sendEventCalled = undefined;
    TestClient.instance = undefined;
    clearGlobalScope();
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getIsolationScope().clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor() / getDsn()', () => {
    test('returns the Dsn', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      expect(dsnToString(client.getDsn()!)).toEqual(PUBLIC_DSN);
    });

    test('allows missing Dsn', () => {
      const options = getDefaultTestClientOptions();
      const client = new TestClient(options);

      expect(client.getDsn()).toBeUndefined();
      expect(client.getTransport()).toBeUndefined();
    });

    test('handles being passed an invalid Dsn', () => {
      // Hide warning logs in the test
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const options = getDefaultTestClientOptions({ dsn: 'abc' });
      const client = new TestClient(options);

      expect(client.getDsn()).toBeUndefined();
      expect(client.getTransport()).toBeUndefined();
    });
  });

  describe('getOptions()', () => {
    test('returns the options', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, test: true });
      const client = new TestClient(options);

      expect(client.getOptions()).toEqual(options);
    });
  });

  describe('getTransport()', () => {
    test('returns undefined when no dsn is set', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({});
      const client = new TestClient(options);

      expect(client.getTransport()).toBeUndefined();
    });
  });

  describe('getBreadcrumbs() / addBreadcrumb()', () => {
    test('adds a breadcrumb', () => {
      const options = getDefaultTestClientOptions({});
      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      const scope = new Scope();

      scope.addBreadcrumb({ message: 'hello' }, 100);
      addBreadcrumb({ message: 'world' });

      const breadcrumbs = scope.getScopeData().breadcrumbs;
      const isolationScopeBreadcrumbs = getIsolationScope().getScopeData().breadcrumbs;

      expect(breadcrumbs).toEqual([{ message: 'hello', timestamp: expect.any(Number) }]);
      expect(isolationScopeBreadcrumbs).toEqual([{ message: 'world', timestamp: expect.any(Number) }]);
    });

    test('accepts a timestamp for new breadcrumbs', () => {
      const options = getDefaultTestClientOptions({});
      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      const scope = new Scope();

      scope.addBreadcrumb({ message: 'hello', timestamp: 1234 }, 100);
      addBreadcrumb({ message: 'world', timestamp: 12345 });

      const breadcrumbs = scope.getScopeData().breadcrumbs;
      const isolationScopeBreadcrumbs = getIsolationScope().getScopeData().breadcrumbs;

      expect(breadcrumbs).toEqual([{ message: 'hello', timestamp: 1234 }]);
      expect(isolationScopeBreadcrumbs).toEqual([{ message: 'world', timestamp: 12345 }]);
    });

    test('discards breadcrumbs beyond `maxBreadcrumbs`', () => {
      const options = getDefaultTestClientOptions({ maxBreadcrumbs: 1 });
      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      addBreadcrumb({ message: 'hello1' });
      addBreadcrumb({ message: 'hello2' });
      addBreadcrumb({ message: 'hello3' });

      const isolationScopeBreadcrumbs = getIsolationScope().getScopeData().breadcrumbs;

      expect(isolationScopeBreadcrumbs).toEqual([{ message: 'hello3', timestamp: expect.any(Number) }]);
    });

    test('calls `beforeBreadcrumb` and adds the breadcrumb without any changes', () => {
      const beforeBreadcrumb = jest.fn(breadcrumb => breadcrumb);
      const options = getDefaultTestClientOptions({ beforeBreadcrumb });
      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      addBreadcrumb({ message: 'hello' });

      const isolationScopeBreadcrumbs = getIsolationScope().getScopeData().breadcrumbs;
      expect(isolationScopeBreadcrumbs).toEqual([{ message: 'hello', timestamp: expect.any(Number) }]);
    });

    test('calls `beforeBreadcrumb` and uses the new one', () => {
      const beforeBreadcrumb = jest.fn(() => ({ message: 'changed' }));
      const options = getDefaultTestClientOptions({ beforeBreadcrumb });
      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      addBreadcrumb({ message: 'hello' });

      const isolationScopeBreadcrumbs = getIsolationScope().getScopeData().breadcrumbs;
      expect(isolationScopeBreadcrumbs).toEqual([{ message: 'changed', timestamp: expect.any(Number) }]);
    });

    test('calls `beforeBreadcrumb` and discards the breadcrumb when returned `null`', () => {
      const beforeBreadcrumb = jest.fn(() => null);
      const options = getDefaultTestClientOptions({ beforeBreadcrumb });
      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      addBreadcrumb({ message: 'hello' });

      const isolationScopeBreadcrumbs = getIsolationScope().getScopeData().breadcrumbs;
      expect(isolationScopeBreadcrumbs).toEqual([]);
    });

    test('`beforeBreadcrumb` gets an access to a hint as a second argument', () => {
      const beforeBreadcrumb = jest.fn((breadcrumb, hint) => ({ ...breadcrumb, data: hint.data }));
      const options = getDefaultTestClientOptions({ beforeBreadcrumb });
      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      addBreadcrumb({ message: 'hello' }, { data: 'someRandomThing' });

      const isolationScopeBreadcrumbs = getIsolationScope().getScopeData().breadcrumbs;
      expect(isolationScopeBreadcrumbs).toEqual([
        { message: 'hello', data: 'someRandomThing', timestamp: expect.any(Number) },
      ]);
    });
  });

  describe('captureException', () => {
    test('captures and sends exceptions', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      client.captureException(new Error('test exception'));
      expect(TestClient.instance!.event).toEqual(
        expect.objectContaining({
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
        }),
      );
    });

    test('sets the correct lastEventId', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      const eventId = client.captureException(new Error('test exception'));
      expect(eventId).toEqual(lastEventId());
    });

    test('allows for providing explicit scope', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
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

      expect(TestClient.instance!.event).toEqual(
        expect.objectContaining({
          extra: {
            bar: 'wat',
            foo: 'wat',
          },
        }),
      );
    });

    test('allows for clearing data from existing scope if explicit one does so in a callback function', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
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

      expect(TestClient.instance!.event).toEqual(
        expect.objectContaining({
          extra: {
            bar: 'wat',
          },
        }),
      );
    });

    test.each([
      ['`Error` instance', new Error('Will I get caught twice?')],
      ['plain object', { 'Will I': 'get caught twice?' }],
      ['primitive wrapper', new String('Will I get caught twice?')],
      // Primitives aren't tested directly here because they need to be wrapped with `objectify` *before*  being passed
      // to `captureException` (which is how we'd end up with a primitive wrapper as tested above) in order for the
      // already-seen check to work . Any primitive which is passed without being wrapped will be captured each time it
      // is encountered, so this test doesn't apply.
    ])("doesn't capture the same exception twice - %s", (_name: string, thrown: any) => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      expect(thrown.__sentry_captured__).toBeUndefined();

      client.captureException(thrown);

      expect(thrown.__sentry_captured__).toBe(true);
      expect(clientEventFromException).toHaveBeenCalledTimes(1);

      client.captureException(thrown);

      // `captureException` should bail right away this second time around and not get as far as calling this again
      expect(clientEventFromException).toHaveBeenCalledTimes(1);
    });
  });

  describe('captureMessage', () => {
    test('captures and sends messages', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      client.captureMessage('test message');

      expect(TestClient.instance!.event).toEqual(
        expect.objectContaining({
          environment: 'production',
          event_id: '42',
          level: 'info',
          message: 'test message',
          timestamp: 2020,
        }),
      );
    });

    test('sets the correct lastEventId', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      const eventId = client.captureMessage('test message');
      expect(eventId).toEqual(lastEventId());
    });

    test('should call `eventFromException` if input to `captureMessage` is not a primitive', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const spy = jest.spyOn(TestClient.instance!, 'eventFromException');

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
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setExtra('foo', 'wat');

      client.captureMessage(
        'test message',
        'warning',
        {
          captureContext: {
            extra: {
              bar: 'wat',
            },
          },
        },
        scope,
      );

      expect(TestClient.instance!.event).toEqual(
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
    test.each([
      ['`Error` instance', new Error('Will I get caught twice?')],
      ['plain object', { 'Will I': 'get caught twice?' }],
      ['primitive wrapper', new String('Will I get caught twice?')],
      // Primitives aren't tested directly here because they need to be wrapped with `objectify` *before*  being passed
      // to `captureEvent` (which is how we'd end up with a primitive wrapper as tested above) in order for the
      // already-seen check to work . Any primitive which is passed without being wrapped will be captured each time it
      // is encountered, so this test doesn't apply.
    ])("doesn't capture an event wrapping the same exception twice - %s", (_name: string, thrown: any) => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      // Note: this is the same test as in `describe(captureException)`, except with the exception already wrapped in a
      // hint and accompanying an event. Duplicated here because some methods skip `captureException` and go straight to
      // `captureEvent`.
      const client = new TestClient(options);
      const event = { exception: { values: [{ type: 'Error', message: 'Will I get caught twice?' }] } };
      const hint = { originalException: thrown };

      expect(thrown.__sentry_captured__).toBeUndefined();

      client.captureEvent(event, hint);

      expect(thrown.__sentry_captured__).toBe(true);
      expect(clientProcess).toHaveBeenCalledTimes(1);

      client.captureEvent(event, hint);

      // `captureEvent` should bail right away this second time around and not get as far as calling this again
      expect(clientProcess).toHaveBeenCalledTimes(1);
    });

    test('sends an event', () => {
      expect.assertions(2);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();

      client.captureEvent({ message: 'message' }, undefined, scope);

      expect(TestClient.instance!.event!.message).toEqual('message');
      expect(TestClient.instance!.event).toEqual(
        expect.objectContaining({
          environment: 'production',
          event_id: '42',
          message: 'message',
          timestamp: 2020,
        }),
      );
    });

    test('sets the correct lastEventId', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      const eventId = client.captureEvent({ message: 'message' }, undefined);
      expect(eventId).toEqual(lastEventId());
    });

    test('does not overwrite existing timestamp', () => {
      expect.assertions(2);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();

      client.captureEvent({ message: 'message', timestamp: 1234 }, undefined, scope);

      expect(TestClient.instance!.event!.message).toEqual('message');
      expect(TestClient.instance!.event).toEqual(
        expect.objectContaining({
          environment: 'production',
          event_id: '42',
          message: 'message',
          timestamp: 1234,
        }),
      );
    });

    test('it adds a trace context all events', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();

      client.captureEvent({ message: 'message' }, { event_id: 'wat' }, scope);

      expect(TestClient.instance!.event!).toEqual(
        expect.objectContaining({
          contexts: {
            trace: {
              parent_span_id: undefined,
              span_id: expect.any(String),
              trace_id: expect.any(String),
            },
          },
        }),
      );
    });

    test('adds `event_id` from hint if available', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();

      client.captureEvent({ message: 'message' }, { event_id: 'wat' }, scope);

      expect(TestClient.instance!.event!).toEqual(
        expect.objectContaining({
          environment: 'production',
          event_id: 'wat',
          message: 'message',
          timestamp: 2020,
        }),
      );
    });

    test('sets default environment to `production` if none provided', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();

      client.captureEvent({ message: 'message' }, undefined, scope);

      expect(TestClient.instance!.event!).toEqual(
        expect.objectContaining({
          environment: 'production',
          event_id: '42',
          message: 'message',
          timestamp: 2020,
        }),
      );
    });

    test('adds the configured environment', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ environment: 'env', dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();

      client.captureEvent({ message: 'message' }, undefined, scope);

      expect(TestClient.instance!.event!).toEqual(
        expect.objectContaining({
          environment: 'env',
          event_id: '42',
          message: 'message',
          timestamp: 2020,
        }),
      );
    });

    test('allows for environment to be explicitly set to falsy value', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, environment: undefined });
      const client = new TestClient(options);
      const scope = new Scope();

      client.captureEvent({ message: 'message' }, undefined, scope);

      expect(TestClient.instance!.event!).toEqual(
        expect.objectContaining({
          environment: undefined,
          event_id: '42',
          message: 'message',
          timestamp: 2020,
        }),
      );
    });

    test('adds the configured release', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, release: 'v1.0.0' });
      const client = new TestClient(options);
      const scope = new Scope();

      client.captureEvent({ message: 'message' }, undefined, scope);

      expect(TestClient.instance!.event!).toEqual(
        expect.objectContaining({
          environment: 'production',
          event_id: '42',
          message: 'message',
          release: 'v1.0.0',
          timestamp: 2020,
        }),
      );
    });

    test('adds breadcrumbs', () => {
      expect.assertions(4);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'breadcrumb' }, 100);

      client.captureEvent({ message: 'message' }, undefined, scope);

      expect(TestClient.instance!.event!).toHaveProperty('event_id', '42');
      expect(TestClient.instance!.event!).toHaveProperty('message', 'message');
      expect(TestClient.instance!.event!).toHaveProperty('breadcrumbs');
      expect(TestClient.instance!.event!.breadcrumbs![0]).toHaveProperty('message', 'breadcrumb');
    });

    test('limits previously saved breadcrumbs', () => {
      expect.assertions(2);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, maxBreadcrumbs: 1 });
      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();
      const scope = new Scope();

      addBreadcrumb({ message: '1' });
      addBreadcrumb({ message: '2' });

      client.captureEvent({ message: 'message' }, undefined, scope);

      expect(TestClient.instance!.event!.breadcrumbs).toHaveLength(1);
      expect(TestClient.instance!.event!.breadcrumbs![0]?.message).toEqual('2');
    });

    test('adds context data', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setExtra('b', 'b');
      scope.setTag('a', 'a');
      scope.setUser({ id: 'user' });

      client.captureEvent({ message: 'message' }, undefined, scope);

      expect(TestClient.instance!.event!).toEqual(
        expect.objectContaining({
          environment: 'production',
          event_id: '42',
          extra: { b: 'b' },
          message: 'message',
          tags: { a: 'a' },
          timestamp: 2020,
          user: { id: 'user' },
        }),
      );
    });

    test('adds fingerprint', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setFingerprint(['abcd']);

      client.captureEvent({ message: 'message' }, undefined, scope);

      expect(TestClient.instance!.event!).toEqual(
        expect.objectContaining({
          environment: 'production',
          event_id: '42',
          fingerprint: ['abcd'],
          message: 'message',
          timestamp: 2020,
        }),
      );
    });

    test('adds installed integrations to sdk info', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, integrations: [new TestIntegration()] });
      const client = new TestClient(options);
      client.init();

      client.captureEvent({ message: 'message' });

      expect(TestClient.instance!.event!.sdk).toEqual({
        integrations: ['TestIntegration'],
      });
    });

    test('send all installed integrations in event sdk metadata', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, integrations: [new TestIntegration()] });
      const client = new TestClient(options);
      client.init();
      client.addIntegration(new AdHocIntegration());

      client.captureException(new Error('test exception'));

      expect(TestClient.instance!.event).toEqual(
        expect.objectContaining({
          sdk: expect.objectContaining({
            integrations: expect.arrayContaining(['TestIntegration', 'AdHockIntegration']),
          }),
        }),
      );
    });

    test('skips empty integrations', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        // @ts-expect-error we want to force invalid integrations here
        integrations: [new TestIntegration(), null, undefined],
      });
      const client = new TestClient(options);
      client.init();

      client.captureEvent({ message: 'message' });

      expect(TestClient.instance!.event!.sdk).toEqual({
        integrations: ['TestIntegration'],
      });
    });

    test('normalizes event with default depth of 3', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
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

      expect(TestClient.instance!.event!).toEqual(
        expect.objectContaining({
          breadcrumbs: [normalizedBreadcrumb, normalizedBreadcrumb, normalizedBreadcrumb],
          // also has trace context from global scope
          contexts: { ...normalizedObject, trace: expect.anything() },
          environment: 'production',
          event_id: '42',
          extra: normalizedObject,
          timestamp: 2020,
          user: normalizedObject,
        }),
      );
    });

    test('normalization respects `normalizeDepth` option', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, normalizeDepth: 2 });
      const client = new TestClient(options);
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

      expect(TestClient.instance!.event!).toEqual(
        expect.objectContaining({
          breadcrumbs: [normalizedBreadcrumb, normalizedBreadcrumb, normalizedBreadcrumb],
          // also has trace context from global scope
          contexts: { ...normalizedObject, trace: expect.anything() },
          environment: 'production',
          event_id: '42',
          extra: normalizedObject,
          timestamp: 2020,
          user: normalizedObject,
        }),
      );
    });

    test('skips normalization when `normalizeDepth: 0`', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, normalizeDepth: 0 });
      const client = new TestClient(options);
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

      expect(TestClient.instance!.event!).toEqual(
        expect.objectContaining({
          breadcrumbs: [normalizedBreadcrumb, normalizedBreadcrumb, normalizedBreadcrumb],
          // also has trace context from global scope
          contexts: { ...normalizedObject, trace: expect.anything() },
          environment: 'production',
          event_id: '42',
          extra: normalizedObject,
          timestamp: 2020,
          user: normalizedObject,
        }),
      );
    });

    test('normalization applies to Transaction and Span consistently', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
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
          {
            data: { _sentry_extra_metrics: { M1: { value: 1 }, M2: { value: 2 } } },
            description: 'first-paint',
            timestamp: 1591603196.637835,
            op: 'paint',
            parent_span_id: 'a3df84a60c2e4e76',
            span_id: '9e15bf99fbe4bc80',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          },
          {
            description: 'first-contentful-paint',
            timestamp: 1591603196.637835,
            op: 'paint',
            parent_span_id: 'a3df84a60c2e4e76',
            span_id: 'aa554c1f506b0783',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          },
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
      const capturedEvent = TestClient.instance!.event!;

      expect(capturedEvent).toEqual(normalizedTransaction);
    });

    test('calls `beforeSend` and uses original event without any changes', () => {
      expect.assertions(2);

      const beforeSend = jest.fn(event => event);
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSend });
      const client = new TestClient(options);

      client.captureEvent({ message: 'hello' });

      expect(beforeSend).toHaveBeenCalled();
      expect(TestClient.instance!.event!.message).toEqual('hello');
    });

    test('calls `beforeSendTransaction` and uses original event without any changes', () => {
      expect.assertions(2);

      const beforeSendTransaction = jest.fn(event => event);
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
      const client = new TestClient(options);

      client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' });

      expect(beforeSendTransaction).toHaveBeenCalled();
      expect(TestClient.instance!.event!.transaction).toBe('/dogs/are/great');
    });

    test('calls `beforeSendSpan` and uses original spans without any changes', () => {
      expect.assertions(2);

      const beforeSendSpan = jest.fn(span => span);
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendSpan });
      const client = new TestClient(options);

      const transaction: Event = {
        transaction: '/cats/are/great',
        type: 'transaction',
        spans: [
          {
            description: 'first span',
            span_id: '9e15bf99fbe4bc80',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          },
          {
            description: 'second span',
            span_id: 'aa554c1f506b0783',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          },
        ],
      };
      client.captureEvent(transaction);

      expect(beforeSendSpan).toHaveBeenCalledTimes(2);
      const capturedEvent = TestClient.instance!.event!;
      expect(capturedEvent.spans).toEqual(transaction.spans);
    });

    test('calls `beforeSend` and uses the modified event', () => {
      expect.assertions(2);

      const beforeSend = jest.fn(event => {
        event.message = 'changed1';
        return event;
      });
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSend });
      const client = new TestClient(options);

      client.captureEvent({ message: 'hello' });

      expect(beforeSend).toHaveBeenCalled();
      expect(TestClient.instance!.event!.message).toEqual('changed1');
    });

    test('calls `beforeSendTransaction` and uses the modified event', () => {
      expect.assertions(2);

      const beforeSendTransaction = jest.fn(event => {
        event.transaction = '/adopt/dont/shop';
        return event;
      });
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
      const client = new TestClient(options);

      client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' });

      expect(beforeSendTransaction).toHaveBeenCalled();
      expect(TestClient.instance!.event!.transaction).toBe('/adopt/dont/shop');
    });

    test('calls `beforeSendTransaction` and drops spans', () => {
      const beforeSendTransaction = jest.fn(event => {
        event.spans = [{ span_id: 'span5', trace_id: 'trace1', start_timestamp: 1234 }];
        return event;
      });
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
      const client = new TestClient(options);

      client.captureEvent({
        transaction: '/dogs/are/great',
        type: 'transaction',
        spans: [
          { span_id: 'span1', trace_id: 'trace1', start_timestamp: 1234 },
          { span_id: 'span2', trace_id: 'trace1', start_timestamp: 1234 },
          { span_id: 'span3', trace_id: 'trace1', start_timestamp: 1234 },
        ],
      });

      expect(beforeSendTransaction).toHaveBeenCalled();
      expect(TestClient.instance!.event!.spans?.length).toBe(1);

      expect(client['_outcomes']).toEqual({ 'before_send:span': 2 });
    });

    test('calls `beforeSendSpan` and uses the modified spans', () => {
      expect.assertions(3);

      const beforeSendSpan = jest.fn(span => {
        span.data = { version: 'bravo' };
        return span;
      });

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendSpan });
      const client = new TestClient(options);
      const transaction: Event = {
        transaction: '/cats/are/great',
        type: 'transaction',
        spans: [
          {
            description: 'first span',
            span_id: '9e15bf99fbe4bc80',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          },
          {
            description: 'second span',
            span_id: 'aa554c1f506b0783',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          },
        ],
      };

      client.captureEvent(transaction);

      expect(beforeSendSpan).toHaveBeenCalledTimes(2);
      const capturedEvent = TestClient.instance!.event!;
      for (const [idx, span] of capturedEvent.spans!.entries()) {
        const originalSpan = transaction.spans![idx];
        expect(span).toEqual({ ...originalSpan, data: { version: 'bravo' } });
      }
    });

    test('calls `beforeSend` and discards the event', () => {
      expect.assertions(4);

      const beforeSend = jest.fn(() => null);
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSend });
      const client = new TestClient(options);
      const captureExceptionSpy = jest.spyOn(client, 'captureException');
      const loggerWarnSpy = jest.spyOn(logger, 'log');

      client.captureEvent({ message: 'hello' });

      expect(beforeSend).toHaveBeenCalled();
      expect(TestClient.instance!.event).toBeUndefined();
      // This proves that the reason the event didn't send/didn't get set on the test client is not because there was an
      // error, but because `beforeSend` returned `null`
      expect(captureExceptionSpy).not.toBeCalled();
      expect(loggerWarnSpy).toBeCalledWith('before send for type `error` returned `null`, will not send event.');
    });

    test('calls `beforeSendTransaction` and discards the event', () => {
      expect.assertions(4);

      const beforeSendTransaction = jest.fn(() => null);
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
      const client = new TestClient(options);
      const captureExceptionSpy = jest.spyOn(client, 'captureException');
      const loggerWarnSpy = jest.spyOn(logger, 'log');

      client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' });

      expect(beforeSendTransaction).toHaveBeenCalled();
      expect(TestClient.instance!.event).toBeUndefined();
      // This proves that the reason the event didn't send/didn't get set on the test client is not because there was an
      // error, but because `beforeSendTransaction` returned `null`
      expect(captureExceptionSpy).not.toBeCalled();
      expect(loggerWarnSpy).toBeCalledWith('before send for type `transaction` returned `null`, will not send event.');
    });

    test('calls `beforeSendSpan` and discards the span', () => {
      const beforeSendSpan = jest.fn(() => null);
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendSpan });
      const client = new TestClient(options);

      const transaction: Event = {
        transaction: '/cats/are/great',
        type: 'transaction',
        spans: [
          {
            description: 'first span',
            span_id: '9e15bf99fbe4bc80',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          },
          {
            description: 'second span',
            span_id: 'aa554c1f506b0783',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          },
        ],
      };
      client.captureEvent(transaction);

      expect(beforeSendSpan).toHaveBeenCalledTimes(2);
      const capturedEvent = TestClient.instance!.event!;
      expect(capturedEvent.spans).toHaveLength(0);
      expect(client['_outcomes']).toEqual({ 'before_send:span': 2 });
    });

    test('calls `beforeSend` and logs info about invalid return value', () => {
      const invalidValues = [undefined, false, true, [], 1];
      expect.assertions(invalidValues.length * 3);

      for (const val of invalidValues) {
        const beforeSend = jest.fn(() => val);
        // @ts-expect-error we need to test regular-js behavior
        const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSend });
        const client = new TestClient(options);
        const loggerWarnSpy = jest.spyOn(logger, 'warn');

        client.captureEvent({ message: 'hello' });

        expect(beforeSend).toHaveBeenCalled();
        expect(TestClient.instance!.event).toBeUndefined();
        expect(loggerWarnSpy).toBeCalledWith(
          new SentryError('before send for type `error` must return `null` or a valid event.'),
        );
      }
    });

    test('calls `beforeSendTransaction` and logs info about invalid return value', () => {
      const invalidValues = [undefined, false, true, [], 1];
      expect.assertions(invalidValues.length * 3);

      for (const val of invalidValues) {
        const beforeSendTransaction = jest.fn(() => val);
        // @ts-expect-error we need to test regular-js behavior
        const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
        const client = new TestClient(options);
        const loggerWarnSpy = jest.spyOn(logger, 'warn');

        client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' });

        expect(beforeSendTransaction).toHaveBeenCalled();
        expect(TestClient.instance!.event).toBeUndefined();
        expect(loggerWarnSpy).toBeCalledWith(
          new SentryError('before send for type `transaction` must return `null` or a valid event.'),
        );
      }
    });

    test('calls async `beforeSend` and uses original event without any changes', done => {
      jest.useFakeTimers();
      expect.assertions(2);

      const beforeSend = jest.fn(
        async event =>
          new Promise<ErrorEvent>(resolve => {
            setTimeout(() => {
              resolve(event);
            }, 1);
          }),
      );
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSend });
      const client = new TestClient(options);

      client.captureEvent({ message: 'hello' });
      jest.runOnlyPendingTimers();

      TestClient.sendEventCalled = (event: Event) => {
        expect(beforeSend).toHaveBeenCalled();
        expect(event.message).toEqual('hello');
      };

      setTimeout(() => {
        done();
      }, 5);

      jest.runOnlyPendingTimers();
    });

    test('calls async `beforeSendTransaction` and uses original event without any changes', done => {
      jest.useFakeTimers();
      expect.assertions(2);

      const beforeSendTransaction = jest.fn(
        async event =>
          new Promise<TransactionEvent>(resolve => {
            setTimeout(() => {
              resolve(event);
            }, 1);
          }),
      );
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
      const client = new TestClient(options);

      client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' });
      jest.runOnlyPendingTimers();

      TestClient.sendEventCalled = (event: Event) => {
        expect(beforeSendTransaction).toHaveBeenCalled();
        expect(event.transaction).toBe('/dogs/are/great');
      };

      setTimeout(() => {
        done();
      }, 5);

      jest.runOnlyPendingTimers();
    });

    test('calls async `beforeSend` and uses the modified event', done => {
      jest.useFakeTimers();
      expect.assertions(2);

      const beforeSend = jest.fn(async event => {
        event.message = 'changed2';
        return new Promise<ErrorEvent>(resolve => {
          setTimeout(() => {
            resolve(event);
          }, 1);
        });
      });
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSend });
      const client = new TestClient(options);

      client.captureEvent({ message: 'hello' });
      jest.runOnlyPendingTimers();

      TestClient.sendEventCalled = (event: Event) => {
        expect(beforeSend).toHaveBeenCalled();
        expect(event.message).toEqual('changed2');
      };

      setTimeout(() => {
        done();
      }, 5);

      jest.runOnlyPendingTimers();
    });

    test('calls async `beforeSendTransaction` and uses the modified event', done => {
      jest.useFakeTimers();
      expect.assertions(2);

      const beforeSendTransaction = jest.fn(async event => {
        event.transaction = '/adopt/dont/shop';
        return new Promise<TransactionEvent>(resolve => {
          setTimeout(() => {
            resolve(event);
          }, 1);
        });
      });
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
      const client = new TestClient(options);

      client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' });
      jest.runOnlyPendingTimers();

      TestClient.sendEventCalled = (event: Event) => {
        expect(beforeSendTransaction).toHaveBeenCalled();
        expect(event.transaction).toBe('/adopt/dont/shop');
      };

      setTimeout(() => {
        done();
      }, 5);

      jest.runOnlyPendingTimers();
    });

    test('calls async `beforeSend` and discards the event', () => {
      jest.useFakeTimers();
      expect.assertions(2);

      const beforeSend = jest.fn(
        async () =>
          new Promise<null>(resolve => {
            setTimeout(() => {
              resolve(null);
            });
          }),
      );
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSend });
      const client = new TestClient(options);

      client.captureEvent({ message: 'hello' });
      jest.runAllTimers();

      expect(beforeSend).toHaveBeenCalled();
      expect(TestClient.instance!.event).toBeUndefined();
    });

    test('calls async `beforeSendTransaction` and discards the event', () => {
      jest.useFakeTimers();
      expect.assertions(2);

      const beforeSendTransaction = jest.fn(
        async () =>
          new Promise<null>(resolve => {
            setTimeout(() => {
              resolve(null);
            });
          }),
      );
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
      const client = new TestClient(options);

      client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' });
      jest.runAllTimers();

      expect(beforeSendTransaction).toHaveBeenCalled();
      expect(TestClient.instance!.event).toBeUndefined();
    });

    test('`beforeSend` gets access to a hint as a second argument', () => {
      expect.assertions(3);

      const beforeSend = jest.fn((event, hint) => ({ ...event, data: hint.data }));
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSend });
      const client = new TestClient(options);

      client.captureEvent({ message: 'hello' }, { data: 'someRandomThing' });

      expect(beforeSend).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ data: 'someRandomThing' }));
      expect(TestClient.instance!.event!.message).toEqual('hello');
      expect((TestClient.instance!.event! as any).data).toEqual('someRandomThing');
    });

    test('`beforeSendTransaction` gets access to a hint as a second argument', () => {
      expect.assertions(3);

      const beforeSendTransaction = jest.fn((event, hint) => ({ ...event, data: hint.data }));
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
      const client = new TestClient(options);

      client.captureEvent(
        { transaction: '/dogs/are/great', type: 'transaction' },
        { data: { dogs: 'yes', cats: 'maybe' } },
      );

      expect(beforeSendTransaction).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ data: { dogs: 'yes', cats: 'maybe' } }),
      );
      expect(TestClient.instance!.event!.transaction).toBe('/dogs/are/great');
      expect((TestClient.instance!.event! as any).data).toEqual({ dogs: 'yes', cats: 'maybe' });
    });

    test('`beforeSend` records dropped events', () => {
      expect.assertions(2);

      const beforeSend = jest.fn(() => null);
      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          beforeSend,
        }),
      );

      const recordLostEventSpy = jest.spyOn(client, 'recordDroppedEvent');

      client.captureEvent({ message: 'hello' }, {});

      expect(beforeSend).toHaveBeenCalled();
      expect(recordLostEventSpy).toHaveBeenCalledWith('before_send', 'error', {
        message: 'hello',
      });
    });

    test('`beforeSendTransaction` records dropped events', () => {
      expect.assertions(2);

      const beforeSendTransaction = jest.fn(() => null);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          beforeSendTransaction,
        }),
      );

      const recordLostEventSpy = jest.spyOn(client, 'recordDroppedEvent');

      client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' });

      expect(beforeSendTransaction).toHaveBeenCalled();
      expect(recordLostEventSpy).toHaveBeenCalledWith('before_send', 'transaction', {
        transaction: '/dogs/are/great',
        type: 'transaction',
      });
    });

    test('event processor drops error event when it returns `null`', () => {
      expect.assertions(3);

      const client = new TestClient(getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));
      const captureExceptionSpy = jest.spyOn(client, 'captureException');
      const loggerLogSpy = jest.spyOn(logger, 'log');
      const scope = new Scope();
      scope.addEventProcessor(() => null);

      client.captureEvent({ message: 'hello' }, {}, scope);

      expect(TestClient.instance!.event).toBeUndefined();
      // This proves that the reason the event didn't send/didn't get set on the test client is not because there was an
      // error, but because the event processor returned `null`
      expect(captureExceptionSpy).not.toBeCalled();
      expect(loggerLogSpy).toBeCalledWith('An event processor returned `null`, will not send event.');
    });

    test('event processor drops transaction event when it returns `null`', () => {
      expect.assertions(3);

      const client = new TestClient(getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));
      const captureExceptionSpy = jest.spyOn(client, 'captureException');
      const loggerLogSpy = jest.spyOn(logger, 'log');
      const scope = new Scope();
      scope.addEventProcessor(() => null);

      client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' }, {}, scope);

      expect(TestClient.instance!.event).toBeUndefined();
      // This proves that the reason the event didn't send/didn't get set on the test client is not because there was an
      // error, but because the event processor returned `null`
      expect(captureExceptionSpy).not.toBeCalled();
      expect(loggerLogSpy).toBeCalledWith('An event processor returned `null`, will not send event.');
    });

    test('event processor records dropped error events', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      const recordLostEventSpy = jest.spyOn(client, 'recordDroppedEvent');

      const scope = new Scope();
      scope.addEventProcessor(() => null);

      client.captureEvent({ message: 'hello' }, {}, scope);

      expect(recordLostEventSpy).toHaveBeenCalledWith('event_processor', 'error', {
        message: 'hello',
      });
    });

    test('event processor records dropped transaction events', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      const recordLostEventSpy = jest.spyOn(client, 'recordDroppedEvent');

      const scope = new Scope();
      scope.addEventProcessor(() => null);

      client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' }, {}, scope);

      expect(recordLostEventSpy).toHaveBeenCalledWith('event_processor', 'transaction', {
        transaction: '/dogs/are/great',
        type: 'transaction',
      });
    });

    test('mutating transaction name with event processors sets transaction-name-change metadata', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableSend: true });
      const client = new TestClient(options);

      const transaction: Event = {
        transaction: '/dogs/are/great',
        type: 'transaction',
        transaction_info: {
          source: 'url',
        },
      };

      const scope = new Scope();
      scope.addEventProcessor(event => {
        event.transaction = '/adopt/dont/shop';
        return event;
      });

      client.captureEvent(transaction, {}, scope);
      expect(TestClient.instance!.event!.transaction).toEqual('/adopt/dont/shop');
      expect(TestClient.instance!.event!.transaction_info).toEqual({
        source: 'custom',
      });
    });

    test('mutating transaction name with `beforeSendTransaction` sets transaction-name-change metadata', () => {
      const beforeSendTransaction = jest.fn(event => {
        event.transaction = '/adopt/dont/shop';
        return event;
      });
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
      const client = new TestClient(options);

      client.captureEvent({
        transaction: '/dogs/are/great',
        type: 'transaction',
        transaction_info: {
          source: 'url',
        },
      });

      expect(beforeSendTransaction).toHaveBeenCalled();
      expect(TestClient.instance!.event!.transaction).toBe('/adopt/dont/shop');
      expect(TestClient.instance!.event!.transaction_info).toEqual({
        source: 'custom',
      });
    });

    test('event processor sends an event and logs when it crashes', () => {
      expect.assertions(3);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const captureExceptionSpy = jest.spyOn(client, 'captureException');
      const loggerWarnSpy = jest.spyOn(logger, 'warn');
      const scope = new Scope();
      const exception = new Error('sorry');
      scope.addEventProcessor(() => {
        throw exception;
      });

      client.captureEvent({ message: 'hello' }, {}, scope);

      expect(TestClient.instance!.event!.exception!.values![0]).toStrictEqual({ type: 'Error', value: 'sorry' });
      expect(captureExceptionSpy).toBeCalledWith(exception, {
        data: {
          __sentry__: true,
        },
        originalException: exception,
      });
      expect(loggerWarnSpy).toBeCalledWith(
        new SentryError(
          `Event processing pipeline threw an error, original event will not be sent. Details have been sent as a new event.\nReason: ${exception}`,
        ),
      );
    });

    test('records events dropped due to `sampleRate` option', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, sampleRate: 0 });
      const client = new TestClient(options);

      const recordLostEventSpy = jest.spyOn(client, 'recordDroppedEvent');

      client.captureEvent({ message: 'hello' }, {});
      expect(recordLostEventSpy).toHaveBeenCalledWith('sample_rate', 'error', {
        message: 'hello',
      });
    });
  });

  describe('integrations', () => {
    beforeEach(() => {
      global.__SENTRY__ = {};
    });

    test('sets up each integration on `init` call', () => {
      expect.assertions(2);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, integrations: [new TestIntegration()] });
      const client = new TestClient(options);
      client.init();

      expect(Object.keys((client as any)._integrations).length).toEqual(1);
      expect(client.getIntegrationByName(TestIntegration.id)).toBeTruthy();
    });

    test('skips installation for `init()` if DSN is not provided', () => {
      expect.assertions(2);

      const options = getDefaultTestClientOptions({ integrations: [new TestIntegration()] });
      const client = new TestClient(options);
      client.init();

      expect(Object.keys((client as any)._integrations).length).toEqual(0);
      expect(client.getIntegrationByName(TestIntegration.id)).toBeFalsy();
    });

    test('skips installation for `init()` if `enabled` is set to `false`', () => {
      expect.assertions(2);

      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enabled: false,
        integrations: [new TestIntegration()],
      });
      const client = new TestClient(options);
      client.init();

      expect(Object.keys((client as any)._integrations).length).toEqual(0);
      expect(client.getIntegrationByName(TestIntegration.id)).toBeFalsy();
    });

    test('does not add integrations twice when calling `init` multiple times', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, integrations: [new TestIntegration()] });
      const client = new TestClient(options);
      // note: not the `Client` method `setupIntegrations`, but the free-standing function which that method calls
      const setupIntegrationsHelper = jest.spyOn(integrationModule, 'setupIntegrations');

      // it should install the first time, because integrations aren't yet installed...
      client.init();

      expect(Object.keys((client as any)._integrations).length).toEqual(1);
      expect(client.getIntegrationByName(TestIntegration.id)).toBeTruthy();
      expect(setupIntegrationsHelper).toHaveBeenCalledTimes(1);

      client.init();

      // is called again...
      expect(setupIntegrationsHelper).toHaveBeenCalledTimes(2);

      // but integrations are only added once anyhow!
      expect(client['_integrations']).toEqual({ TestIntegration: expect.any(TestIntegration) });
    });
  });

  describe('flush/close', () => {
    test('flush', async () => {
      jest.useRealTimers();
      expect.assertions(4);

      const { makeTransport, getSendCalled, getSentCount, delay } = makeFakeTransport(1);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          enableSend: true,
          transport: makeTransport,
        }),
      );

      client.captureMessage('test');

      expect(getSendCalled()).toEqual(1);
      expect(getSentCount()).toEqual(0);

      await client.flush(delay);

      expect(getSentCount()).toEqual(1);
      expect(getSendCalled()).toEqual(1);
    });

    test('flush with some events being processed async', async () => {
      jest.useRealTimers();
      expect.assertions(4);

      const { makeTransport, getSendCalled, getSentCount, delay } = makeFakeTransport(300);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          enableSend: true,
          transport: makeTransport,
        }),
      );

      const spy = jest.spyOn(TestClient.instance!, 'eventFromMessage');
      spy.mockImplementationOnce(
        (message, level) =>
          new SyncPromise(resolve => {
            setTimeout(() => resolve({ message, level }), 150);
          }),
      );
      client.captureMessage('test async');
      client.captureMessage('test non-async');

      expect(getSendCalled()).toEqual(1);
      expect(getSentCount()).toEqual(0);

      await client.flush(delay);

      expect(getSentCount()).toEqual(2);
      expect(getSendCalled()).toEqual(2);

      spy.mockRestore();
    });

    test('close', async () => {
      jest.useRealTimers();
      expect.assertions(4);

      const { makeTransport, delay, getSentCount } = makeFakeTransport(300);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          enableSend: true,
          transport: makeTransport,
        }),
      );
      expect(client.captureMessage('test')).toBeTruthy();

      await client.close(delay);
      expect(getSentCount()).toBe(1);

      expect(client.captureMessage('test')).toBeTruthy();
      await client.close(delay);
      // Sends after close shouldn't work anymore
      expect(getSentCount()).toBe(1);
    });

    test('multiple concurrent flush calls should just work', async () => {
      jest.useRealTimers();
      expect.assertions(3);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

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

  describe('sendEvent', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('emits `afterSendEvent` when sending an error', async () => {
      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          enableSend: true,
        }),
      );

      // @ts-expect-error Accessing private transport API
      const mockSend = jest.spyOn(client._transport, 'send');

      const errorEvent: Event = { message: 'error' };

      const callback = jest.fn();
      client.on('afterSendEvent', callback);

      client.sendEvent(errorEvent);
      jest.runAllTimers();
      // Wait for two ticks
      // note that for whatever reason, await new Promise(resolve => setTimeout(resolve, 0)) causes the test to hang
      await undefined;
      await undefined;

      expect(mockSend).toBeCalledTimes(1);
      expect(callback).toBeCalledTimes(1);
      expect(callback).toBeCalledWith(errorEvent, {});
    });

    it('emits `afterSendEvent` when sending a transaction', async () => {
      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          enableSend: true,
        }),
      );

      // @ts-expect-error Accessing private transport API
      const mockSend = jest.spyOn(client._transport, 'send');

      const transactionEvent: Event = { type: 'transaction', event_id: 'tr1' };

      const callback = jest.fn();
      client.on('afterSendEvent', callback);

      client.sendEvent(transactionEvent);
      jest.runAllTimers();
      // Wait for two ticks
      // note that for whatever reason, await new Promise(resolve => setTimeout(resolve, 0)) causes the test to hang
      await undefined;
      await undefined;

      expect(mockSend).toBeCalledTimes(1);
      expect(callback).toBeCalledTimes(1);
      expect(callback).toBeCalledWith(transactionEvent, {});
    });

    it('still triggers `afterSendEvent` when transport.send rejects', async () => {
      expect.assertions(3);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          enableSend: true,
        }),
      );

      // @ts-expect-error Accessing private transport API
      const mockSend = jest.spyOn(client._transport, 'send').mockImplementation(() => {
        return Promise.reject('send error');
      });

      const errorEvent: Event = { message: 'error' };

      const callback = jest.fn();
      client.on('afterSendEvent', callback);

      client.sendEvent(errorEvent);
      jest.runAllTimers();
      // Wait for two ticks
      // note that for whatever reason, await new Promise(resolve => setTimeout(resolve, 0)) causes the test to hang
      await undefined;
      await undefined;

      expect(mockSend).toBeCalledTimes(1);
      expect(callback).toBeCalledTimes(1);
      expect(callback).toBeCalledWith(errorEvent, 'send error');
    });

    it('passes the response to the hook', async () => {
      expect.assertions(3);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          enableSend: true,
        }),
      );

      // @ts-expect-error Accessing private transport API
      const mockSend = jest.spyOn(client._transport, 'send').mockImplementation(() => {
        return Promise.resolve({ statusCode: 200 });
      });

      const errorEvent: Event = { message: 'error' };

      const callback = jest.fn();
      client.on('afterSendEvent', callback);

      client.sendEvent(errorEvent);
      jest.runAllTimers();
      // Wait for two ticks
      // note that for whatever reason, await new Promise(resolve => setTimeout(resolve, 0)) causes the test to hang
      await undefined;
      await undefined;

      expect(mockSend).toBeCalledTimes(1);
      expect(callback).toBeCalledTimes(1);
      expect(callback).toBeCalledWith(errorEvent, { statusCode: 200 });
    });
  });

  describe('captureSession()', () => {
    test('sends sessions to the client', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const session = makeSession({ release: 'test' });

      client.captureSession(session);

      expect(TestClient.instance!.session).toEqual(session);
    });
  });

  describe('recordDroppedEvent()/_clearOutcomes()', () => {
    test('records and returns outcomes', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      client.recordDroppedEvent('ratelimit_backoff', 'error');
      client.recordDroppedEvent('ratelimit_backoff', 'error');
      client.recordDroppedEvent('network_error', 'transaction');
      client.recordDroppedEvent('network_error', 'transaction');
      client.recordDroppedEvent('before_send', 'error');
      client.recordDroppedEvent('before_send', 'transaction');
      client.recordDroppedEvent('event_processor', 'attachment');
      client.recordDroppedEvent('network_error', 'transaction');

      const clearedOutcomes = client._clearOutcomes();

      expect(clearedOutcomes).toEqual(
        expect.arrayContaining([
          {
            reason: 'ratelimit_backoff',
            category: 'error',
            quantity: 2,
          },
          {
            reason: 'network_error',
            category: 'transaction',
            quantity: 3,
          },
          {
            reason: 'before_send',
            category: 'error',
            quantity: 1,
          },
          {
            reason: 'before_send',
            category: 'transaction',
            quantity: 1,
          },
          {
            reason: 'event_processor',
            category: 'attachment',
            quantity: 1,
          },
        ]),
      );
    });

    test('clears outcomes', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      client.recordDroppedEvent('ratelimit_backoff', 'error');
      client.recordDroppedEvent('ratelimit_backoff', 'error');
      client.recordDroppedEvent('event_processor', 'attachment');

      const clearedOutcomes1 = client._clearOutcomes();
      expect(clearedOutcomes1.length).toEqual(2);

      const clearedOutcomes2 = client._clearOutcomes();
      expect(clearedOutcomes2.length).toEqual(0);

      client.recordDroppedEvent('network_error', 'attachment');

      const clearedOutcomes3 = client._clearOutcomes();
      expect(clearedOutcomes3.length).toEqual(1);

      const clearedOutcomes4 = client._clearOutcomes();
      expect(clearedOutcomes4.length).toEqual(0);
    });
  });

  describe('hooks', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });

    // Make sure types work for both Client & BaseClient
    const scenarios = [
      ['BaseClient', new TestClient(options)],
      ['Client', new TestClient(options) as Client],
    ] as const;

    describe.each(scenarios)('with client %s', (_, client) => {
      it('should call a beforeEnvelope hook', () => {
        expect.assertions(1);

        const mockEnvelope = [
          {
            event_id: '12345',
          },
          {},
        ] as Envelope;

        client.on('beforeEnvelope', envelope => {
          expect(envelope).toEqual(mockEnvelope);
        });

        client.emit('beforeEnvelope', mockEnvelope);
      });
    });
  });

  describe('hook removal with `on`', () => {
    it('should return a cleanup function that, when executed, unregisters a hook', async () => {
      jest.useFakeTimers();
      expect.assertions(8);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          enableSend: true,
        }),
      );

      const mockSend = jest.spyOn(client.getTransport()!, 'send').mockImplementation(() => {
        return Promise.resolve({ statusCode: 200 });
      });

      const errorEvent: Event = { message: 'error' };

      const callback = jest.fn();
      const removeAfterSendEventListenerFn = client.on('afterSendEvent', callback);

      expect(client['_hooks']['afterSendEvent']).toEqual([callback]);

      client.sendEvent(errorEvent);
      jest.runAllTimers();
      // Wait for two ticks
      // note that for whatever reason, await new Promise(resolve => setTimeout(resolve, 0)) causes the test to hang
      await undefined;
      await undefined;

      expect(mockSend).toBeCalledTimes(1);
      expect(callback).toBeCalledTimes(1);
      expect(callback).toBeCalledWith(errorEvent, { statusCode: 200 });

      // Should unregister `afterSendEvent` callback.
      removeAfterSendEventListenerFn();
      expect(client['_hooks']['afterSendEvent']).toEqual([]);

      client.sendEvent(errorEvent);
      jest.runAllTimers();
      // Wait for two ticks
      // note that for whatever reason, await new Promise(resolve => setTimeout(resolve, 0)) causes the test to hang
      await undefined;
      await undefined;

      expect(mockSend).toBeCalledTimes(2);
      // Note that the `callback` has still been called only once and not twice,
      // because we unregistered it.
      expect(callback).toBeCalledTimes(1);
      expect(callback).toBeCalledWith(errorEvent, { statusCode: 200 });
    });
  });

  describe('withMonitor', () => {
    test('handles successful synchronous operations', () => {
      const result = 'foo';
      const callback = jest.fn().mockReturnValue(result);

      const returnedResult = withMonitor('test-monitor', callback);

      expect(returnedResult).toBe(result);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('handles synchronous errors', () => {
      const error = new Error('Test error');
      const callback = jest.fn().mockImplementation(() => {
        throw error;
      });

      expect(() => withMonitor('test-monitor', callback)).toThrowError(error);
    });

    test('handles successful asynchronous operations', async () => {
      const result = 'foo';
      const callback = jest.fn().mockResolvedValue(result);

      const promise = withMonitor('test-monitor', callback);
      await expect(promise).resolves.toEqual(result);
    });

    // This test is skipped because jest keeps retrying ad infinitum
    // when encountering an unhandled rejections.
    // We could set "NODE_OPTIONS='--unhandled-rejections=warn' but it
    // would affect the entire test suite.
    // Maybe this can be re-enabled when switching to vitest.
    //
    // eslint-disable-next-line @sentry-internal/sdk/no-skipped-tests
    test.skip('handles asynchronous errors', async () => {
      const error = new Error('Test error');
      const callback = jest.fn().mockRejectedValue(error);

      const promise = await withMonitor('test-monitor', callback);
      await expect(promise).rejects.toThrowError(error);
    });
  });
});
