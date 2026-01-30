import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';
import type { SeverityLevel } from '../../src';
import {
  addBreadcrumb,
  dsnToString,
  getCurrentScope,
  getIsolationScope,
  lastEventId,
  makeSession,
  Scope,
  setCurrentClient,
  SyncPromise,
  withMonitor,
} from '../../src';
import * as integrationModule from '../../src/integration';
import { _INTERNAL_captureLog } from '../../src/logs/internal';
import { _INTERNAL_captureMetric } from '../../src/metrics/internal';
import * as traceModule from '../../src/tracing/trace';
import { DEFAULT_TRANSPORT_BUFFER_SIZE } from '../../src/transports/base';
import type { Envelope } from '../../src/types-hoist/envelope';
import type { ErrorEvent, Event, TransactionEvent } from '../../src/types-hoist/event';
import type { SpanJSON } from '../../src/types-hoist/span';
import * as debugLoggerModule from '../../src/utils/debug-logger';
import * as miscModule from '../../src/utils/misc';
import * as timeModule from '../../src/utils/time';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { AdHocIntegration, AsyncTestIntegration, TestIntegration } from '../mocks/integration';
import { makeFakeTransport } from '../mocks/transport';
import { clearGlobalScope } from '../testutils';

const PUBLIC_DSN = 'https://username@domain/123';
// eslint-disable-next-line no-var
declare var global: any;

const clientEventFromException = vi.spyOn(TestClient.prototype, 'eventFromException');
const clientProcess = vi.spyOn(TestClient.prototype as any, '_process');

vi.spyOn(miscModule, 'uuid4').mockImplementation(() => '12312012123120121231201212312012');
vi.spyOn(debugLoggerModule, 'consoleSandbox').mockImplementation(cb => cb());
vi.spyOn(timeModule, 'dateTimestampInSeconds').mockImplementation(() => 2020);

describe('Client', () => {
  beforeEach(() => {
    TestClient.sendEventCalled = undefined;
    TestClient.instance = undefined;
    clearGlobalScope();
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getIsolationScope().clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const options = getDefaultTestClientOptions({ dsn: 'abc' });
      const client = new TestClient(options);

      expect(client.getDsn()).toBeUndefined();
      expect(client.getTransport()).toBeUndefined();
    });
  });

  describe('constructor() / warnings', () => {
    test('does not warn for defaults', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      new TestClient(options);

      expect(consoleWarnSpy).toHaveBeenCalledTimes(0);
      consoleWarnSpy.mockRestore();
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

    test('it records `buffer_overflow` client discard reason when buffer overflows', () => {
      const options = getDefaultTestClientOptions({ maxBreadcrumbs: 1 });
      const client = new TestClient(options);
      const recordLostEventSpy = vi.spyOn(client, 'recordDroppedEvent');
      setCurrentClient(client);
      getIsolationScope().setClient(client);
      client.init();

      addBreadcrumb({ message: 'hello1' });
      addBreadcrumb({ message: 'hello2' });
      addBreadcrumb({ message: 'hello3' });

      expect(recordLostEventSpy).toHaveBeenCalledTimes(2);
      expect(recordLostEventSpy).toHaveBeenLastCalledWith('buffer_overflow', 'log_item');
    });

    test('calls `beforeBreadcrumb` and adds the breadcrumb without any changes', () => {
      const beforeBreadcrumb = vi.fn(breadcrumb => breadcrumb);
      const options = getDefaultTestClientOptions({ beforeBreadcrumb });
      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      addBreadcrumb({ message: 'hello' });

      const isolationScopeBreadcrumbs = getIsolationScope().getScopeData().breadcrumbs;
      expect(isolationScopeBreadcrumbs).toEqual([{ message: 'hello', timestamp: expect.any(Number) }]);
    });

    test('calls `beforeBreadcrumb` and uses the new one', () => {
      const beforeBreadcrumb = vi.fn(() => ({ message: 'changed' }));
      const options = getDefaultTestClientOptions({ beforeBreadcrumb });
      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      addBreadcrumb({ message: 'hello' });

      const isolationScopeBreadcrumbs = getIsolationScope().getScopeData().breadcrumbs;
      expect(isolationScopeBreadcrumbs).toEqual([{ message: 'changed', timestamp: expect.any(Number) }]);
    });

    test('calls `beforeBreadcrumb` and discards the breadcrumb when returned `null`', () => {
      const beforeBreadcrumb = vi.fn(() => null);
      const options = getDefaultTestClientOptions({ beforeBreadcrumb });
      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      addBreadcrumb({ message: 'hello' });

      const isolationScopeBreadcrumbs = getIsolationScope().getScopeData().breadcrumbs;
      expect(isolationScopeBreadcrumbs).toEqual([]);
    });

    test('`beforeBreadcrumb` gets an access to a hint as a second argument', () => {
      const beforeBreadcrumb = vi.fn((breadcrumb, hint) => ({ ...breadcrumb, data: hint.data }));
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
          event_id: '12312012123120121231201212312012',
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

    test('does not truncate exception values by default', () => {
      const exceptionMessageLength = 10_000;
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      client.captureException(new Error('a'.repeat(exceptionMessageLength)));
      expect(TestClient.instance!.event).toEqual(
        expect.objectContaining({
          exception: {
            values: [{ type: 'Error', value: 'a'.repeat(exceptionMessageLength) }],
          },
        }),
      );
    });

    test('truncates exception values according to `maxValueLength` option', () => {
      const maxValueLength = 10;
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, maxValueLength });
      const client = new TestClient(options);

      client.captureException(new Error('a'.repeat(50)));
      expect(TestClient.instance!.event).toEqual(
        expect.objectContaining({
          exception: {
            values: [{ type: 'Error', value: `${'a'.repeat(maxValueLength)}...` }],
          },
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

    test('captures debug message', () => {
      const logSpy = vi.spyOn(debugLoggerModule.debug, 'log').mockImplementation(() => undefined);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      client.captureException(new Error('test error here'));
      client.captureException({});

      expect(logSpy).toHaveBeenCalledTimes(2);
      expect(logSpy).toBeCalledWith('Captured error event `test error here`');
      expect(logSpy).toBeCalledWith('Captured error event `<unknown>`');

      logSpy.mockRestore();
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
          event_id: '12312012123120121231201212312012',
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
      const spy = vi.spyOn(TestClient.instance!, 'eventFromException');

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

    test('captures debug message', () => {
      const logSpy = vi.spyOn(debugLoggerModule.debug, 'log').mockImplementation(() => undefined);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      client.captureMessage('test error here');

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toBeCalledWith('Captured error event `test error here`');

      logSpy.mockRestore();
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
          event_id: '12312012123120121231201212312012',
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
          event_id: '12312012123120121231201212312012',
          message: 'message',
          timestamp: 1234,
        }),
      );
    });

    test('it adds a trace context to all events', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();

      client.captureEvent({ message: 'message' }, { event_id: 'wat' }, scope);

      expect(TestClient.instance?.event?.contexts?.trace).toEqual({
        parent_span_id: undefined,
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      });
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
          event_id: '12312012123120121231201212312012',
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
          event_id: '12312012123120121231201212312012',
          message: 'message',
          timestamp: 2020,
        }),
      );
    });

    test('uses default environment when set to falsy value', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, environment: undefined });
      const client = new TestClient(options);
      const scope = new Scope();

      client.captureEvent({ message: 'message' }, undefined, scope);

      expect(TestClient.instance!.event!).toEqual(
        expect.objectContaining({
          environment: 'production',
          event_id: '12312012123120121231201212312012',
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
          event_id: '12312012123120121231201212312012',
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

      expect(TestClient.instance!.event!).toHaveProperty('event_id', '12312012123120121231201212312012');
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
          event_id: '12312012123120121231201212312012',
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
          event_id: '12312012123120121231201212312012',
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
          event_id: '12312012123120121231201212312012',
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
          event_id: '12312012123120121231201212312012',
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
          event_id: '12312012123120121231201212312012',
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
            description: 'first-paint',
            timestamp: 1591603196.637835,
            op: 'paint',
            parent_span_id: 'a3df84a60c2e4e76',
            span_id: '9e15bf99fbe4bc80',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
          {
            description: 'first-contentful-paint',
            timestamp: 1591603196.637835,
            op: 'paint',
            parent_span_id: 'a3df84a60c2e4e76',
            span_id: 'aa554c1f506b0783',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
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

      const beforeSend = vi.fn(event => event);
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSend });
      const client = new TestClient(options);

      client.captureEvent({ message: 'hello' });

      expect(beforeSend).toHaveBeenCalled();
      expect(TestClient.instance!.event!.message).toEqual('hello');
    });

    test('calls `beforeSendTransaction` and uses original event without any changes', () => {
      expect.assertions(2);

      const beforeSendTransaction = vi.fn(event => event);
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
      const client = new TestClient(options);

      client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' });

      expect(beforeSendTransaction).toHaveBeenCalled();
      expect(TestClient.instance!.event!.transaction).toBe('/dogs/are/great');
    });

    test('calls `beforeSendSpan` and uses original spans without any changes', () => {
      expect.assertions(3);

      const beforeSendSpan = vi.fn(span => span);
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendSpan });
      const client = new TestClient(options);

      const transaction: Event = {
        transaction: '/dogs/are/great',
        type: 'transaction',
        spans: [
          {
            description: 'first span',
            span_id: '9e15bf99fbe4bc80',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
          {
            description: 'second span',
            span_id: 'aa554c1f506b0783',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
        ],
      };
      client.captureEvent(transaction);

      expect(beforeSendSpan).toHaveBeenCalledTimes(3);
      const capturedEvent = TestClient.instance!.event!;
      expect(capturedEvent.spans).toEqual(transaction.spans);
      expect(capturedEvent.transaction).toEqual(transaction.transaction);
    });

    test('uses `ignoreSpans` to drop root spans', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, ignoreSpans: ['root span'] });
      const client = new TestClient(options);

      const captureExceptionSpy = vi.spyOn(client, 'captureException');
      const loggerLogSpy = vi.spyOn(debugLoggerModule.debug, 'log');

      const transaction: Event = {
        transaction: 'root span',
        type: 'transaction',
        spans: [
          {
            description: 'first span',
            span_id: '9e15bf99fbe4bc80',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
          {
            description: 'second span',
            span_id: 'aa554c1f506b0783',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
        ],
      };
      client.captureEvent(transaction);

      expect(TestClient.instance!.event).toBeUndefined();
      // This proves that the reason the event didn't send/didn't get set on the test client is not because there was an
      // error, but because the event processor returned `null`
      expect(captureExceptionSpy).not.toBeCalled();
      expect(loggerLogSpy).toBeCalledWith('before send for type `transaction` returned `null`, will not send event.');
    });

    test('uses `ignoreSpans` to drop child spans', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, ignoreSpans: ['first span'] });
      const client = new TestClient(options);
      const recordDroppedEventSpy = vi.spyOn(client, 'recordDroppedEvent');

      const transaction: Event = {
        contexts: {
          trace: {
            span_id: 'root-span-id',
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          },
        },
        transaction: 'root span',
        type: 'transaction',
        spans: [
          {
            description: 'first span',
            span_id: '9e15bf99fbe4bc80',
            parent_span_id: 'root-span-id',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
          {
            description: 'second span',
            span_id: 'aa554c1f506b0783',
            parent_span_id: 'root-span-id',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
          {
            description: 'third span',
            span_id: 'aa554c1f506b0784',
            parent_span_id: '9e15bf99fbe4bc80',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
        ],
      };
      client.captureEvent(transaction);

      const capturedEvent = TestClient.instance!.event!;
      expect(capturedEvent.spans).toEqual([
        {
          description: 'second span',
          span_id: 'aa554c1f506b0783',
          parent_span_id: 'root-span-id',
          start_timestamp: 1591603196.637835,
          trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          data: {},
        },
        {
          description: 'third span',
          span_id: 'aa554c1f506b0784',
          parent_span_id: 'root-span-id',
          start_timestamp: 1591603196.637835,
          trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          data: {},
        },
      ]);
      expect(recordDroppedEventSpy).toBeCalledWith('before_send', 'span', 1);
    });

    test('uses complex `ignoreSpans` to drop child spans', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        ignoreSpans: [
          {
            name: 'first span',
          },
          {
            name: 'span',
            op: 'op1',
          },
        ],
      });
      const client = new TestClient(options);
      const recordDroppedEventSpy = vi.spyOn(client, 'recordDroppedEvent');

      const transaction: Event = {
        contexts: {
          trace: {
            span_id: 'root-span-id',
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          },
        },
        transaction: 'root span',
        type: 'transaction',
        spans: [
          {
            description: 'first span',
            span_id: '9e15bf99fbe4bc80',
            parent_span_id: 'root-span-id',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
          {
            description: 'second span',
            op: 'op1',
            span_id: 'aa554c1f506b0783',
            parent_span_id: 'root-span-id',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
          {
            description: 'third span',
            op: 'other op',
            span_id: 'aa554c1f506b0784',
            parent_span_id: '9e15bf99fbe4bc80',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
        ],
      };
      client.captureEvent(transaction);

      const capturedEvent = TestClient.instance!.event!;
      expect(capturedEvent.spans).toEqual([
        {
          description: 'third span',
          op: 'other op',
          span_id: 'aa554c1f506b0784',
          parent_span_id: 'root-span-id',
          start_timestamp: 1591603196.637835,
          trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          data: {},
        },
      ]);
      expect(recordDroppedEventSpy).toBeCalledWith('before_send', 'span', 2);
    });

    test('does not modify existing contexts for root span in `beforeSendSpan`', () => {
      const beforeSendSpan = vi.fn((span: SpanJSON) => {
        return {
          ...span,
          data: {
            modified: 'true',
          },
        };
      });
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendSpan });
      const client = new TestClient(options);

      const transaction: Event = {
        transaction: '/animals/are/great',
        type: 'transaction',
        spans: [],
        breadcrumbs: [
          {
            type: 'ui.click',
          },
        ],
        contexts: {
          trace: {
            data: {
              modified: 'false',
              dropMe: 'true',
            },
            span_id: '9e15bf99fbe4bc80',
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          },
          app: {
            data: {
              modified: 'false',
            },
          },
        },
      };
      client.captureEvent(transaction);

      expect(beforeSendSpan).toHaveBeenCalledTimes(1);
      const capturedEvent = TestClient.instance!.event!;
      expect(capturedEvent).toEqual({
        transaction: '/animals/are/great',
        breadcrumbs: [
          {
            type: 'ui.click',
          },
        ],
        type: 'transaction',
        spans: [],
        environment: 'production',
        event_id: '12312012123120121231201212312012',
        start_timestamp: 0,
        timestamp: 2020,
        contexts: {
          trace: {
            data: {
              modified: 'true',
            },
            span_id: '9e15bf99fbe4bc80',
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
          },
          app: {
            data: {
              modified: 'false',
            },
          },
        },
      });
    });

    test('calls `beforeSendTransaction` and uses the modified event', () => {
      expect.assertions(2);

      const beforeSendTransaction = vi.fn(event => {
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
      const beforeSendTransaction = vi.fn(event => {
        event.spans = [{ span_id: 'span5', trace_id: 'trace1', start_timestamp: 1234 }];
        return event;
      });
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
      const client = new TestClient(options);

      client.captureEvent({
        transaction: '/dogs/are/great',
        type: 'transaction',
        spans: [
          { span_id: 'span1', trace_id: 'trace1', start_timestamp: 1234, data: {} },
          { span_id: 'span2', trace_id: 'trace1', start_timestamp: 1234, data: {} },
          { span_id: 'span3', trace_id: 'trace1', start_timestamp: 1234, data: {} },
        ],
      });

      expect(beforeSendTransaction).toHaveBeenCalled();
      expect(TestClient.instance!.event!.spans?.length).toBe(1);

      expect(client['_outcomes']).toEqual({ 'before_send:span': 2 });
    });

    test('calls `beforeSendSpan` and uses the modified spans', () => {
      expect.assertions(4);

      const beforeSendSpan = vi.fn(span => {
        span.data = { version: 'bravo' };
        return span;
      });

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendSpan });
      const client = new TestClient(options);
      const transaction: Event = {
        transaction: '/dogs/are/great',
        type: 'transaction',
        spans: [
          {
            description: 'first span',
            span_id: '9e15bf99fbe4bc80',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
          {
            description: 'second span',
            span_id: 'aa554c1f506b0783',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
        ],
      };

      client.captureEvent(transaction);

      expect(beforeSendSpan).toHaveBeenCalledTimes(3);
      const capturedEvent = TestClient.instance!.event!;
      for (const [idx, span] of capturedEvent.spans!.entries()) {
        const originalSpan = transaction.spans![idx];
        expect(span).toEqual({ ...originalSpan, data: { version: 'bravo' } });
      }
      expect(capturedEvent.contexts?.trace?.data).toEqual({ version: 'bravo' });
    });

    test('calls `beforeSend` and discards the event', () => {
      expect.assertions(4);

      const beforeSend = vi.fn(() => null);
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSend });
      const client = new TestClient(options);
      const captureExceptionSpy = vi.spyOn(client, 'captureException');
      const loggerLogSpy = vi.spyOn(debugLoggerModule.debug, 'log');

      client.captureEvent({ message: 'hello' });

      expect(beforeSend).toHaveBeenCalled();
      expect(TestClient.instance!.event).toBeUndefined();
      // This proves that the reason the event didn't send/didn't get set on the test client is not because there was an
      // error, but because `beforeSend` returned `null`
      expect(captureExceptionSpy).not.toBeCalled();
      expect(loggerLogSpy).toBeCalledWith('before send for type `error` returned `null`, will not send event.');
    });

    test('calls `beforeSendTransaction` and discards the event', () => {
      expect.assertions(4);

      const beforeSendTransaction = vi.fn(() => null);
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
      const client = new TestClient(options);
      const captureExceptionSpy = vi.spyOn(client, 'captureException');
      const loggerLogSpy = vi.spyOn(debugLoggerModule.debug, 'log');

      client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' });

      expect(beforeSendTransaction).toHaveBeenCalled();
      expect(TestClient.instance!.event).toBeUndefined();
      // This proves that the reason the event didn't send/didn't get set on the test client is not because there was an
      // error, but because `beforeSendTransaction` returned `null`
      expect(captureExceptionSpy).not.toBeCalled();
      expect(loggerLogSpy).toBeCalledWith('before send for type `transaction` returned `null`, will not send event.');
    });

    test('does not discard span and warn when returning null from `beforeSendSpan', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const beforeSendSpan = vi.fn(() => null as unknown as SpanJSON);
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendSpan });
      const client = new TestClient(options);

      const transaction: Event = {
        transaction: '/dogs/are/great',
        type: 'transaction',
        spans: [
          {
            description: 'first span',
            span_id: '9e15bf99fbe4bc80',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
          {
            description: 'second span',
            span_id: 'aa554c1f506b0783',
            start_timestamp: 1591603196.637835,
            trace_id: '86f39e84263a4de99c326acab3bfe3bd',
            data: {},
          },
        ],
      };
      client.captureEvent(transaction);

      expect(beforeSendSpan).toHaveBeenCalledTimes(3);
      const capturedEvent = TestClient.instance!.event!;
      expect(capturedEvent.spans).toHaveLength(2);
      expect(client['_outcomes']).toEqual({});

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Sentry] Returning null from `beforeSendSpan` is disallowed. To drop certain spans, configure the respective integrations directly or use `ignoreSpans`.',
      );
      consoleWarnSpy.mockRestore();
    });

    test('calls `beforeSend` and logs info about invalid return value', () => {
      const invalidValues = [undefined, false, true, [], 1];
      expect.assertions(invalidValues.length * 3);

      for (const val of invalidValues) {
        const beforeSend = vi.fn(() => val);
        // @ts-expect-error we need to test regular-js behavior
        const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSend });
        const client = new TestClient(options);
        const loggerWarnSpy = vi.spyOn(debugLoggerModule.debug, 'warn');

        client.captureEvent({ message: 'hello' });

        expect(beforeSend).toHaveBeenCalled();
        expect(TestClient.instance!.event).toBeUndefined();
        expect(loggerWarnSpy).toBeCalledWith('before send for type `error` must return `null` or a valid event.');
      }
    });

    test('calls `beforeSendTransaction` and logs info about invalid return value', () => {
      const invalidValues = [undefined, false, true, [], 1];
      expect.assertions(invalidValues.length * 3);

      for (const val of invalidValues) {
        const beforeSendTransaction = vi.fn(() => val);
        // @ts-expect-error we need to test regular-js behavior
        const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSendTransaction });
        const client = new TestClient(options);
        const loggerWarnSpy = vi.spyOn(debugLoggerModule.debug, 'warn');

        client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' });

        expect(beforeSendTransaction).toHaveBeenCalled();
        expect(TestClient.instance!.event).toBeUndefined();
        expect(loggerWarnSpy).toBeCalledWith('before send for type `transaction` must return `null` or a valid event.');
      }
    });

    test('calls async `beforeSend` and uses original event without any changes', () =>
      new Promise<void>(done => {
        vi.useFakeTimers();
        expect.assertions(2);

        const beforeSend = vi.fn(
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
        vi.runOnlyPendingTimers();

        TestClient.sendEventCalled = (event: Event) => {
          expect(beforeSend).toHaveBeenCalled();
          expect(event.message).toEqual('hello');
          done();
        };

        vi.runOnlyPendingTimers();
      }));

    test('calls async `beforeSendTransaction` and uses original event without any changes', () =>
      new Promise<void>(done => {
        vi.useFakeTimers();
        expect.assertions(2);

        const beforeSendTransaction = vi.fn(
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
        vi.runOnlyPendingTimers();

        TestClient.sendEventCalled = (event: Event) => {
          expect(beforeSendTransaction).toHaveBeenCalled();
          expect(event.transaction).toBe('/dogs/are/great');
          done();
        };

        vi.runOnlyPendingTimers();
      }));

    test('calls async `beforeSend` and uses the modified event', () =>
      new Promise<void>(done => {
        vi.useFakeTimers();
        expect.assertions(2);

        const beforeSend = vi.fn(async event => {
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
        vi.runOnlyPendingTimers();

        TestClient.sendEventCalled = (event: Event) => {
          expect(beforeSend).toHaveBeenCalled();
          expect(event.message).toEqual('changed2');
          done();
        };

        vi.runOnlyPendingTimers();
      }));

    test('calls async `beforeSendTransaction` and uses the modified event', () =>
      new Promise<void>(done => {
        vi.useFakeTimers();
        expect.assertions(2);

        const beforeSendTransaction = vi.fn(async event => {
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
        vi.runOnlyPendingTimers();

        TestClient.sendEventCalled = (event: Event) => {
          expect(beforeSendTransaction).toHaveBeenCalled();
          expect(event.transaction).toBe('/adopt/dont/shop');
          done();
        };

        vi.runOnlyPendingTimers();
      }));

    test('calls async `beforeSend` and discards the event', () => {
      vi.useFakeTimers();
      expect.assertions(2);

      const beforeSend = vi.fn(
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
      vi.runAllTimers();

      expect(beforeSend).toHaveBeenCalled();
      expect(TestClient.instance!.event).toBeUndefined();
    });

    test('calls async `beforeSendTransaction` and discards the event', () => {
      vi.useFakeTimers();
      expect.assertions(2);

      const beforeSendTransaction = vi.fn(
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
      vi.runAllTimers();

      expect(beforeSendTransaction).toHaveBeenCalled();
      expect(TestClient.instance!.event).toBeUndefined();
    });

    test('`beforeSend` gets access to a hint as a second argument', () => {
      expect.assertions(3);

      const beforeSend = vi.fn((event, hint) => ({ ...event, data: hint.data }));
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, beforeSend });
      const client = new TestClient(options);

      client.captureEvent({ message: 'hello' }, { data: 'someRandomThing' });

      expect(beforeSend).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ data: 'someRandomThing' }));
      expect(TestClient.instance!.event!.message).toEqual('hello');
      expect((TestClient.instance!.event! as any).data).toEqual('someRandomThing');
    });

    test('`beforeSendTransaction` gets access to a hint as a second argument', () => {
      expect.assertions(3);

      const beforeSendTransaction = vi.fn((event, hint) => ({ ...event, data: hint.data }));
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

      const beforeSend = vi.fn(() => null);
      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          beforeSend,
        }),
      );

      const recordLostEventSpy = vi.spyOn(client, 'recordDroppedEvent');

      client.captureEvent({ message: 'hello' }, {});

      expect(beforeSend).toHaveBeenCalled();
      expect(recordLostEventSpy).toHaveBeenCalledWith('before_send', 'error');
    });

    test('`beforeSendTransaction` records dropped events', () => {
      expect.assertions(2);

      const beforeSendTransaction = vi.fn(() => null);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          beforeSendTransaction,
        }),
      );

      const recordLostEventSpy = vi.spyOn(client, 'recordDroppedEvent');

      client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' });

      expect(beforeSendTransaction).toHaveBeenCalled();
      expect(recordLostEventSpy).toHaveBeenCalledWith('before_send', 'transaction');
    });

    test('event processor drops error event when it returns `null`', () => {
      expect.assertions(3);

      const client = new TestClient(getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));
      const captureExceptionSpy = vi.spyOn(client, 'captureException');
      const loggerLogSpy = vi.spyOn(debugLoggerModule.debug, 'log');
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
      const captureExceptionSpy = vi.spyOn(client, 'captureException');
      const loggerLogSpy = vi.spyOn(debugLoggerModule.debug, 'log');
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

      const recordLostEventSpy = vi.spyOn(client, 'recordDroppedEvent');

      const scope = new Scope();
      scope.addEventProcessor(() => null);

      client.captureEvent({ message: 'hello' }, {}, scope);

      expect(recordLostEventSpy).toHaveBeenCalledWith('event_processor', 'error');
    });

    test('event processor records dropped transaction events', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      const recordLostEventSpy = vi.spyOn(client, 'recordDroppedEvent');

      const scope = new Scope();
      scope.addEventProcessor(() => null);

      client.captureEvent({ transaction: '/dogs/are/great', type: 'transaction' }, {}, scope);

      expect(recordLostEventSpy).toHaveBeenCalledWith('event_processor', 'transaction');
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
      const beforeSendTransaction = vi.fn(event => {
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

    test('event processor sends an event and logs when it crashes synchronously', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const captureExceptionSpy = vi.spyOn(client, 'captureException');
      const loggerWarnSpy = vi.spyOn(debugLoggerModule.debug, 'warn');
      const scope = new Scope();
      const exception = new Error('sorry 1');
      scope.addEventProcessor(() => {
        throw exception;
      });

      client.captureEvent({ message: 'hello' }, {}, scope);

      expect(TestClient.instance!.event!.exception!.values![0]).toStrictEqual({
        type: 'Error',
        value: 'sorry 1',
        mechanism: { type: 'internal', handled: false },
      });
      expect(captureExceptionSpy).toBeCalledWith(exception, {
        data: {
          __sentry__: true,
        },
        originalException: exception,
        mechanism: { type: 'internal', handled: false },
      });
      expect(loggerWarnSpy).toBeCalledWith(
        `Event processing pipeline threw an error, original event will not be sent. Details have been sent as a new event.\nReason: ${exception}`,
      );
    });

    test('event processor sends an event and logs when it crashes asynchronously', async () => {
      vi.useFakeTimers();

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const captureExceptionSpy = vi.spyOn(client, 'captureException');
      const loggerWarnSpy = vi.spyOn(debugLoggerModule.debug, 'warn');
      const scope = new Scope();
      const exception = new Error('sorry 2');
      scope.addEventProcessor(() => {
        return new Promise((_resolve, reject) => {
          reject(exception);
        });
      });

      client.captureEvent({ message: 'hello' }, {}, scope);

      await vi.runOnlyPendingTimersAsync();

      expect(TestClient.instance!.event!.exception!.values![0]).toStrictEqual({
        type: 'Error',
        value: 'sorry 2',
        mechanism: { type: 'internal', handled: false },
      });
      expect(captureExceptionSpy).toBeCalledWith(exception, {
        data: {
          __sentry__: true,
        },
        originalException: exception,
        mechanism: { type: 'internal', handled: false },
      });
      expect(loggerWarnSpy).toBeCalledWith(
        `Event processing pipeline threw an error, original event will not be sent. Details have been sent as a new event.\nReason: ${exception}`,
      );
    });

    test('event processor sends an event and logs when it crashes synchronously in processor chain', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const captureExceptionSpy = vi.spyOn(client, 'captureException');
      const scope = new Scope();
      const exception = new Error('sorry 3');

      const processor1 = vi.fn(event => {
        return event;
      });
      const processor2 = vi.fn(() => {
        throw exception;
      });
      const processor3 = vi.fn(event => {
        return event;
      });

      scope.addEventProcessor(processor1);
      scope.addEventProcessor(processor2);
      scope.addEventProcessor(processor3);

      client.captureEvent({ message: 'hello' }, {}, scope);

      expect(processor1).toHaveBeenCalledTimes(1);
      expect(processor2).toHaveBeenCalledTimes(1);
      expect(processor3).toHaveBeenCalledTimes(0);

      expect(captureExceptionSpy).toBeCalledWith(exception, {
        data: {
          __sentry__: true,
        },
        originalException: exception,
        mechanism: { type: 'internal', handled: false },
      });
    });

    test('event processor sends an event and logs when it crashes asynchronously in processor chain', async () => {
      vi.useFakeTimers();

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const captureExceptionSpy = vi.spyOn(client, 'captureException');
      const scope = new Scope();
      const exception = new Error('sorry 4');

      const processor1 = vi.fn(async event => {
        return event;
      });
      const processor2 = vi.fn(async () => {
        throw exception;
      });
      const processor3 = vi.fn(event => {
        return event;
      });

      scope.addEventProcessor(processor1);
      scope.addEventProcessor(processor2);
      scope.addEventProcessor(processor3);

      client.captureEvent({ message: 'hello' }, {}, scope);
      await vi.runOnlyPendingTimersAsync();

      expect(processor1).toHaveBeenCalledTimes(1);
      expect(processor2).toHaveBeenCalledTimes(1);
      expect(processor3).toHaveBeenCalledTimes(0);

      expect(captureExceptionSpy).toBeCalledWith(exception, {
        data: {
          __sentry__: true,
        },
        originalException: exception,
        mechanism: { type: 'internal', handled: false },
      });
    });

    test('client-level event processor that throws on all events does not cause infinite recursion', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      let processorCallCount = 0;
      // Add processor at client level - this runs on ALL events including internal exceptions
      client.addEventProcessor(() => {
        processorCallCount++;
        throw new Error('Processor always throws');
      });

      client.captureMessage('test message');

      // Should be called once for the original message
      // internal exception events skips event processors entirely.
      expect(processorCallCount).toBe(1);

      // Verify the processor error was captured and sent
      expect(TestClient.instance!.event!.exception!.values![0]).toStrictEqual({
        type: 'Error',
        value: 'Processor always throws',
        mechanism: { type: 'internal', handled: false },
      });
    });

    test('records events dropped due to `sampleRate` option', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, sampleRate: 0 });
      const client = new TestClient(options);

      const recordLostEventSpy = vi.spyOn(client, 'recordDroppedEvent');

      client.captureEvent({ message: 'hello' }, {});
      expect(recordLostEventSpy).toHaveBeenCalledWith('sample_rate', 'error');
    });

    test('captures debug message', () => {
      const logSpy = vi.spyOn(debugLoggerModule.debug, 'log').mockImplementation(() => undefined);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      client.captureEvent({ message: 'hello' });
      // transactions are ignored and not logged
      client.captureEvent({ type: 'transaction', message: 'hello 2' });

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toBeCalledWith('Captured error event `hello`');

      logSpy.mockRestore();
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
      const setupIntegrationsHelper = vi.spyOn(integrationModule, 'setupIntegrations');

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
      vi.useRealTimers();
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
      vi.useRealTimers();
      expect.assertions(4);

      const { makeTransport, getSendCalled, getSentCount, delay } = makeFakeTransport(300);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          enableSend: true,
          transport: makeTransport,
        }),
      );

      const spy = vi.spyOn(TestClient.instance!, 'eventFromMessage');
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
      vi.useRealTimers();
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
      vi.useRealTimers();
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

    test('flush returns immediately when nothing is processing', async () => {
      vi.useFakeTimers();
      expect.assertions(2);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      // just to ensure the client init'd
      vi.advanceTimersByTime(100);

      const elapsed = Date.now();
      const done = client.flush(1000).then(result => {
        expect(result).toBe(true);
        expect(Date.now() - elapsed).toBeLessThan(2);
      });

      // ensures that only after 1 ms, we're already done flushing
      vi.advanceTimersByTime(1);
      await done;
    });

    test('flush with early exit when processing completes', async () => {
      vi.useRealTimers();
      expect.assertions(3);

      const { makeTransport, getSendCalled, getSentCount } = makeFakeTransport(50);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          enableSend: true,
          transport: makeTransport,
        }),
      );

      client.captureMessage('test');
      expect(getSendCalled()).toEqual(1);

      const startTime = Date.now();
      await client.flush(5000);
      const elapsed = Date.now() - startTime;

      expect(getSentCount()).toEqual(1);
      // if this flakes, remove the test
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('sendEvent', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('emits `afterSendEvent` when sending an error', async () => {
      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          enableSend: true,
        }),
      );

      // @ts-expect-error Accessing private transport API
      const mockSend = vi.spyOn(client._transport, 'send');

      const errorEvent: Event = { message: 'error' };

      const callback = vi.fn();
      client.on('afterSendEvent', callback);

      client.sendEvent(errorEvent);
      await vi.runAllTimersAsync();

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
      const mockSend = vi.spyOn(client._transport, 'send');

      const transactionEvent: Event = { type: 'transaction', event_id: 'tr1' };

      const callback = vi.fn();
      client.on('afterSendEvent', callback);

      client.sendEvent(transactionEvent);
      await vi.runAllTimersAsync();

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
      const mockSend = vi.spyOn(client._transport, 'send').mockImplementation(() => {
        return Promise.reject('send error');
      });

      const errorEvent: Event = { message: 'error' };

      const callback = vi.fn();
      client.on('afterSendEvent', callback);

      client.sendEvent(errorEvent);
      await vi.runAllTimersAsync();

      expect(mockSend).toBeCalledTimes(1);
      expect(callback).toBeCalledTimes(1);
      expect(callback).toBeCalledWith(errorEvent, {});
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
      const mockSend = vi.spyOn(client._transport, 'send').mockImplementation(() => {
        return Promise.resolve({ statusCode: 200 });
      });

      const errorEvent: Event = { message: 'error' };

      const callback = vi.fn();
      client.on('afterSendEvent', callback);

      client.sendEvent(errorEvent);
      vi.runAllTimers();
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

  describe('_updateSessionFromEvent()', () => {
    describe('event has no exceptions', () => {
      it('sets status to crashed if level is fatal', () => {
        const client = new TestClient(getDefaultTestClientOptions());
        const session = makeSession();
        getCurrentScope().setSession(session);

        client.captureEvent({ message: 'test', level: 'fatal' });

        const updatedSession = client.session;

        expect(updatedSession).toMatchObject({
          duration: expect.any(Number),
          errors: 1,
          init: false,
          sid: expect.any(String),
          started: expect.any(Number),
          status: 'crashed',
          timestamp: expect.any(Number),
        });
      });

      it.each(['error', 'warning', 'log', 'info', 'debug'] as const)(
        'sets status to ok if level is %s',
        (level: SeverityLevel) => {
          const client = new TestClient(getDefaultTestClientOptions());
          const session = makeSession();
          getCurrentScope().setSession(session);

          client.captureEvent({ message: 'test', level });

          const updatedSession = client.session;

          expect(updatedSession?.status).toEqual('ok');
        },
      );
    });

    describe('event has exceptions', () => {
      it.each(['fatal', 'error', 'warning', 'log', 'info', 'debug'] as const)(
        'sets status ok for handled exceptions and ignores event level %s',
        (level: SeverityLevel) => {
          const client = new TestClient(getDefaultTestClientOptions());
          const session = makeSession();
          getCurrentScope().setSession(session);

          client.captureException(new Error('test'), { captureContext: { level } });

          const updatedSession = client.session;

          expect(updatedSession?.status).toEqual('ok');
        },
      );

      it.each(['fatal', 'error', 'warning', 'log', 'info', 'debug'] as const)(
        'sets status crashed for unhandled exceptions and ignores event level %s',
        (level: SeverityLevel) => {
          const client = new TestClient(getDefaultTestClientOptions());
          const session = makeSession();
          getCurrentScope().setSession(session);

          client.captureException(new Error('test'), { captureContext: { level }, mechanism: { handled: false } });

          const updatedSession = client.session;

          expect(updatedSession?.status).toEqual('crashed');
        },
      );

      it('sets status crashed if at least one exception is unhandled', () => {
        const client = new TestClient(getDefaultTestClientOptions());
        const session = makeSession();
        getCurrentScope().setSession(session);

        const event: Event = {
          exception: {
            values: [
              {
                mechanism: { type: 'generic', handled: true },
              },
              {
                mechanism: { type: 'generic', handled: false },
              },
              {
                mechanism: { type: 'generic', handled: true },
              },
            ],
          },
        };

        client.captureEvent(event);

        const updatedSession = client.session;

        expect(updatedSession).toMatchObject({
          status: 'crashed',
          errors: 1, // an event with multiple exceptions still counts as one error in the session
        });
      });
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

    it('should call a beforeEnvelope hook', () => {
      const client = new TestClient(options);
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

    it('returns a cleanup function that, when executed, unregisters a hook', async () => {
      vi.useFakeTimers();
      expect.assertions(8);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: PUBLIC_DSN,
          enableSend: true,
        }),
      );

      const mockSend = vi.spyOn(client.getTransport()!, 'send').mockImplementation(() => {
        return Promise.resolve({ statusCode: 200 });
      });

      const errorEvent: Event = { message: 'error' };

      const callback = vi.fn();
      const removeAfterSendEventListenerFn = client.on('afterSendEvent', callback);

      expect(client['_hooks']['afterSendEvent']!.size).toBe(1);

      client.sendEvent(errorEvent);
      vi.runAllTimers();
      // Wait for two ticks
      // note that for whatever reason, await new Promise(resolve => setTimeout(resolve, 0)) causes the test to hang
      await undefined;
      await undefined;

      expect(mockSend).toBeCalledTimes(1);
      expect(callback).toBeCalledTimes(1);
      expect(callback).toBeCalledWith(errorEvent, { statusCode: 200 });

      // Should unregister `afterSendEvent` callback.
      removeAfterSendEventListenerFn();
      expect(client['_hooks']['afterSendEvent']!.size).toBe(0);

      client.sendEvent(errorEvent);
      vi.runAllTimers();
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

    it('allows synchronously unregistering multiple callbacks from within the callback', () => {
      const client = new TestClient(getDefaultTestClientOptions());

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const removeCallback1 = client.on('close', () => {
        callback1();
        removeCallback1();
      });
      const removeCallback2 = client.on('close', () => {
        callback2();
        removeCallback2();
      });

      client.emit('close');

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);

      callback1.mockReset();
      callback2.mockReset();

      client.emit('close');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('allows synchronously unregistering other callbacks from within one callback', () => {
      const client = new TestClient(getDefaultTestClientOptions());

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const removeCallback1 = client.on('close', () => {
        callback1();
        removeCallback1();
        removeCallback2();
      });
      const removeCallback2 = client.on('close', () => {
        callback2();
        removeCallback2();
        removeCallback1();
      });

      client.emit('close');

      expect(callback1).toHaveBeenCalledTimes(1);
      // callback2 was already cancelled from within callback1, so it must not be called
      expect(callback2).not.toHaveBeenCalled();

      callback1.mockReset();
      callback2.mockReset();

      client.emit('close');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('allows registering and unregistering the same callback multiple times', () => {
      const client = new TestClient(getDefaultTestClientOptions());
      const callback = vi.fn();

      const unregister1 = client.on('close', callback);
      const unregister2 = client.on('close', callback);

      client.emit('close');

      expect(callback).toHaveBeenCalledTimes(2);

      unregister1();

      callback.mockReset();

      client.emit('close');

      expect(callback).toHaveBeenCalledTimes(1);

      unregister2();

      callback.mockReset();
      client.emit('close');

      expect(callback).not.toHaveBeenCalled();
    });

    it('handles unregistering a callback multiple times', () => {
      const client = new TestClient(getDefaultTestClientOptions());
      const callback = vi.fn();

      const unregister = client.on('close', callback);
      client.emit('close');
      expect(callback).toHaveBeenCalledTimes(1);

      callback.mockReset();
      unregister();
      unregister();
      unregister();

      client.emit('close');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('withMonitor', () => {
    test('handles successful synchronous operations', () => {
      const result = 'foo';
      const callback = vi.fn().mockReturnValue(result);

      const returnedResult = withMonitor('test-monitor', callback);

      expect(returnedResult).toBe(result);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('handles synchronous errors', () => {
      const error = new Error('Test error');
      const callback = vi.fn().mockImplementation(() => {
        throw error;
      });

      expect(() => withMonitor('test-monitor', callback)).toThrowError(error);
    });

    test('handles successful asynchronous operations', async () => {
      const result = 'foo';
      const callback = vi.fn().mockResolvedValue(result);

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
      const callback = vi.fn().mockRejectedValue(error);

      const promise = await withMonitor('test-monitor', callback);
      await expect(promise).rejects.toThrowError(error);
    });

    describe('isolateTrace', () => {
      const startNewTraceSpy = vi.spyOn(traceModule, 'startNewTrace').mockImplementation(cb => cb());

      beforeEach(() => {
        startNewTraceSpy.mockClear();
      });

      it('starts a new trace when isolateTrace is true (sync)', () => {
        const result = 'foo';
        const callback = vi.fn().mockReturnValue(result);

        const returnedResult = withMonitor('test-monitor', callback, {
          schedule: { type: 'crontab', value: '* * * * *' },
          isolateTrace: true,
        });

        expect(returnedResult).toBe(result);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(startNewTraceSpy).toHaveBeenCalledTimes(1);
      });

      it('starts a new trace when isolateTrace is true (async)', async () => {
        const result = 'foo';
        const callback = vi.fn().mockResolvedValue(result);

        const promise = withMonitor('test-monitor', callback, {
          schedule: { type: 'crontab', value: '* * * * *' },
          isolateTrace: true,
        });
        await expect(promise).resolves.toEqual(result);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(startNewTraceSpy).toHaveBeenCalledTimes(1);
      });

      it("doesn't start a new trace when isolateTrace is false (sync)", () => {
        const result = 'foo';
        const callback = vi.fn().mockReturnValue(result);

        const returnedResult = withMonitor('test-monitor', callback, {
          schedule: { type: 'crontab', value: '* * * * *' },
          isolateTrace: false,
        });

        expect(returnedResult).toBe(result);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(startNewTraceSpy).not.toHaveBeenCalled();
      });

      it("doesn't start a new trace when isolateTrace is false (async)", async () => {
        const result = 'foo';
        const callback = vi.fn().mockResolvedValue(result);

        const promise = withMonitor('test-monitor', callback, {
          schedule: { type: 'crontab', value: '* * * * *' },
          isolateTrace: false,
        });

        await expect(promise).resolves.toEqual(result);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(startNewTraceSpy).not.toHaveBeenCalled();
      });

      it("doesn't start a new trace by default", () => {
        const result = 'foo';
        const callback = vi.fn().mockReturnValue(result);

        const returnedResult = withMonitor('test-monitor', callback, {
          schedule: { type: 'crontab', value: '* * * * *' },
        });

        expect(returnedResult).toBe(result);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(startNewTraceSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('enableLogs', () => {
    it('defaults to  `undefined`', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      expect(client.getOptions().enableLogs).toBeUndefined();
    });

    it('can be set as a top-level option', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
      const client = new TestClient(options);
      expect(client.getOptions().enableLogs).toBe(true);
    });

    it('can be set as an experimental option', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, _experiments: { enableLogs: true } });
      const client = new TestClient(options);
      expect(client.getOptions().enableLogs).toBe(true);
    });

    test('top-level option takes precedence over experimental option', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
        _experiments: { enableLogs: false },
      });
      const client = new TestClient(options);
      expect(client.getOptions().enableLogs).toBe(true);
    });
  });

  describe('log weight-based flushing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('flushes logs when weight exceeds 800KB', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      // Create a large log message that will exceed the 800KB threshold
      const largeMessage = 'x'.repeat(400_000); // 400KB string
      _INTERNAL_captureLog({ message: largeMessage, level: 'info' }, scope);

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    });

    it('accumulates log weight without flushing when under threshold', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      // Create a log message that won't exceed the threshold
      const message = 'x'.repeat(100_000); // 100KB string
      _INTERNAL_captureLog({ message, level: 'info' }, scope);

      expect(sendEnvelopeSpy).not.toHaveBeenCalled();
    });

    it('flushes logs after idle timeout', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      // Add a log which will trigger afterCaptureLog event
      _INTERNAL_captureLog({ message: 'test log', level: 'info' }, scope);

      expect(sendEnvelopeSpy).not.toHaveBeenCalled();

      // Fast forward the idle timeout (5 seconds)
      vi.advanceTimersByTime(5000);

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    });

    it('does not reset idle timeout when new logs are captured', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      // Add initial log (starts the timer)
      _INTERNAL_captureLog({ message: 'test log 1', level: 'info' }, scope);

      // Fast forward part of the idle timeout
      vi.advanceTimersByTime(2500);

      // Add another log which should NOT reset the timeout
      _INTERNAL_captureLog({ message: 'test log 2', level: 'info' }, scope);

      // Fast forward the remaining time to reach the full timeout from the first log
      vi.advanceTimersByTime(2500);

      // Should have flushed both logs since timeout was not reset
      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    });

    it('starts new timer after timeout completes and flushes', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      // First batch: Add a log and let it flush
      _INTERNAL_captureLog({ message: 'test log 1', level: 'info' }, scope);

      // Fast forward to trigger the first flush
      vi.advanceTimersByTime(5000);

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);

      // Second batch: Add another log after the first flush completed
      _INTERNAL_captureLog({ message: 'test log 2', level: 'info' }, scope);

      // Should not have flushed yet
      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);

      // Fast forward to trigger the second flush
      vi.advanceTimersByTime(5000);

      // Should have flushed the second log
      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(2);
    });

    it('flushes logs on flush event', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      // Add some logs
      _INTERNAL_captureLog({ message: 'test1', level: 'info' }, scope);
      _INTERNAL_captureLog({ message: 'test2', level: 'info' }, scope);

      // Trigger flush event
      client.emit('flush');

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    });

    it('does not flush logs when logs are disabled', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      // Create a large log message
      const largeMessage = 'x'.repeat(400_000);
      _INTERNAL_captureLog({ message: largeMessage, level: 'info' }, scope);

      expect(sendEnvelopeSpy).not.toHaveBeenCalled();
    });
  });

  describe('metric weight-based flushing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('flushes metrics when weight exceeds 800KB', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      // Create large metrics that will exceed the 800KB threshold
      const largeValue = 'x'.repeat(400_000); // 400KB string
      _INTERNAL_captureMetric(
        { name: 'large_metric', value: 1, type: 'counter', attributes: { large_value: largeValue } },
        { scope },
      );

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    });

    it('accumulates metric weight without flushing when under threshold', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      // Create metrics that won't exceed the threshold
      _INTERNAL_captureMetric({ name: 'test_metric', value: 42, type: 'counter', attributes: {} }, { scope });

      expect(sendEnvelopeSpy).not.toHaveBeenCalled();
    });

    it('flushes metrics on flush event', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      // Add some metrics
      _INTERNAL_captureMetric({ name: 'metric1', value: 1, type: 'counter', attributes: {} }, { scope });
      _INTERNAL_captureMetric({ name: 'metric2', value: 2, type: 'counter', attributes: {} }, { scope });

      // Trigger flush event
      client.emit('flush');

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('promise buffer usage', () => {
    it('respects the default value of the buffer size', async () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);

      client.addIntegration(new AsyncTestIntegration());

      Array.from({ length: DEFAULT_TRANSPORT_BUFFER_SIZE + 1 }).forEach(() => {
        client.captureException(new Error('ʕノ•ᴥ•ʔノ ︵ ┻━┻'));
      });

      expect(client._clearOutcomes()).toEqual([{ reason: 'queue_overflow', category: 'error', quantity: 1 }]);
    });

    it('records queue_overflow when promise buffer is full', async () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, transportOptions: { bufferSize: 1 } });
      const client = new TestClient(options);

      client.addIntegration(new AsyncTestIntegration());

      client.captureException(new Error('first'));
      client.captureException(new Error('second'));
      client.captureException(new Error('third'));

      expect(client._clearOutcomes()).toEqual([{ reason: 'queue_overflow', category: 'error', quantity: 2 }]);
    });

    it('records different types of dropped events', async () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, transportOptions: { bufferSize: 1 } });
      const client = new TestClient(options);

      client.addIntegration(new AsyncTestIntegration());

      client.captureException(new Error('first')); // error
      client.captureException(new Error('second')); // error
      client.captureMessage('third'); // unknown
      client.captureEvent({ message: 'fourth' }); // error
      client.captureEvent({ message: 'fifth', type: 'replay_event' }); // replay
      client.captureEvent({ message: 'sixth', type: 'transaction' }); // transaction

      expect(client._clearOutcomes()).toEqual([
        { reason: 'queue_overflow', category: 'error', quantity: 2 },
        { reason: 'queue_overflow', category: 'unknown', quantity: 1 },
        { reason: 'queue_overflow', category: 'replay', quantity: 1 },
        { reason: 'queue_overflow', category: 'transaction', quantity: 1 },
      ]);
    });

    it('should skip the promise buffer with sync integrations', async () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, transportOptions: { bufferSize: 1 } });
      const client = new TestClient(options);

      client.addIntegration(new TestIntegration());

      client.captureException(new Error('first'));
      client.captureException(new Error('second'));
      client.captureException(new Error('third'));

      expect(client._clearOutcomes()).toEqual([]);
    });
  });
});
