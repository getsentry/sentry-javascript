import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { applySdkMetadata, createTransport, dedupeIntegration, getIsolationScope, Scope } from '../../src';
import { startRequestSession } from '../../src/integrations/http/record-request-session';
import { AsyncTestIntegration } from '../mocks/integration';
import { _INTERNAL_captureMetric, _INTERNAL_getMetricBuffer } from '../../src/metrics/internal';
import type { ServerRuntimeClientOptions } from '../../src/server-runtime-client';
import { ServerRuntimeClient } from '../../src/server-runtime-client';
import type { ErrorEvent, Event, EventHint } from '../../src/types/event';
import { resetGlobals } from '../testutils';

const PUBLIC_DSN = 'https://username@domain/123';

function getDefaultClientOptions(options: Partial<ServerRuntimeClientOptions> = {}): ServerRuntimeClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
    ...options,
  };
}

/** Captures an error in the isolation scope of a request, as the HTTP integration does in Node. */
function captureErrorInScope(client: ServerRuntimeClient, message: string, requestIsolationScope: Scope): void {
  client.captureEvent({
    exception: { values: [{ type: 'Error', value: message }] },
    sdkProcessingMetadata: { capturedSpanIsolationScope: requestIsolationScope },
  });
}

/** Captures equal errors in a request with its own isolation scope. */
function captureErrorInRequest(client: ServerRuntimeClient, message: string, route = '/', count = 1): void {
  const requestIsolationScope = new Scope();
  requestIsolationScope.setTag('route', route);
  const endRequestSession = startRequestSession(client, { requestIsolationScope });
  for (let i = 0; i < count; i++) {
    captureErrorInScope(client, message, requestIsolationScope);
  }
  endRequestSession();
}

function delayed(event: ErrorEvent): Promise<ErrorEvent> {
  return new Promise(resolve => setTimeout(() => resolve(event), 10));
}

describe('ServerRuntimeClient', () => {
  let client: ServerRuntimeClient;

  const currentScope = new Scope();
  const isolationScope = new Scope();

  describe('_prepareEvent', () => {
    test('adds platform to event', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      const client = new ServerRuntimeClient({ ...options, platform: 'blargh' });

      const event: Event = {};
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint, currentScope, isolationScope);

      expect(event.platform).toEqual('blargh');
    });

    test('adds server_name to event', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      const client = new ServerRuntimeClient({ ...options, serverName: 'server' });

      const event: Event = {};
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint, currentScope, isolationScope);

      expect(event.server_name).toEqual('server');
    });

    test('adds runtime context to event', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      const client = new ServerRuntimeClient({ ...options, runtime: { name: 'edge' } });

      const event: Event = {};
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint, currentScope, isolationScope);

      expect(event.contexts?.runtime).toEqual({
        name: 'edge',
      });
    });

    test("doesn't clobber existing runtime data", () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      const client = new ServerRuntimeClient({ ...options, runtime: { name: 'edge' } });

      const event: Event = { contexts: { runtime: { name: 'foo', version: '1.2.3' } } };
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint, currentScope, isolationScope);

      expect(event.contexts?.runtime).toEqual({ name: 'foo', version: '1.2.3' });
      expect(event.contexts?.runtime).not.toEqual({ name: 'edge' });
    });
  });

  describe('captureCheckIn', () => {
    it('sends a checkIn envelope', () => {
      const options = getDefaultClientOptions({
        dsn: PUBLIC_DSN,
        serverName: 'bar',
        release: '1.0.0',
        environment: 'dev',
      });
      client = new ServerRuntimeClient(options);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      const id = client.captureCheckIn(
        { monitorSlug: 'foo', status: 'in_progress' },
        {
          schedule: {
            type: 'crontab',
            value: '0 * * * *',
          },
          checkinMargin: 2,
          maxRuntime: 12333,
          timezone: 'Canada/Eastern',
          failureIssueThreshold: 2,
          recoveryThreshold: 3,
        },
      );

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
      expect(sendEnvelopeSpy).toHaveBeenCalledWith([
        expect.any(Object),
        [
          [
            expect.any(Object),
            {
              check_in_id: id,
              monitor_slug: 'foo',
              status: 'in_progress',
              release: '1.0.0',
              environment: 'dev',
              monitor_config: {
                schedule: {
                  type: 'crontab',
                  value: '0 * * * *',
                },
                checkin_margin: 2,
                max_runtime: 12333,
                timezone: 'Canada/Eastern',
                failure_issue_threshold: 2,
                recovery_threshold: 3,
              },
            },
          ],
        ],
      ]);

      client.captureCheckIn({ monitorSlug: 'foo', status: 'ok', duration: 1222, checkInId: id });

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(2);
      expect(sendEnvelopeSpy).toHaveBeenCalledWith([
        expect.any(Object),
        [
          [
            expect.any(Object),
            {
              check_in_id: id,
              monitor_slug: 'foo',
              duration: 1222,
              status: 'ok',
              release: '1.0.0',
              environment: 'dev',
            },
          ],
        ],
      ]);
    });

    it('does not send a checkIn envelope if disabled', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN, serverName: 'bar', enabled: false });
      client = new ServerRuntimeClient(options);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      client.captureCheckIn({ monitorSlug: 'foo', status: 'in_progress' });

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe('captureException', () => {
    it('sends an exception event with level error', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      client = new ServerRuntimeClient(options);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      client.captureException(new Error('foo'));

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
      expect(sendEnvelopeSpy).toHaveBeenCalledWith([
        expect.any(Object),
        [
          [
            expect.any(Object),
            expect.objectContaining({
              level: 'error',
            }),
          ],
        ],
      ]);
    });
  });

  describe('request sessions', () => {
    beforeEach(() => {
      resetGlobals();
    });

    it.each([
      ['errored for a handled exception', {}, undefined, { errored: 1 }],
      ['crashed for an unhandled exception', {}, { mechanism: { type: 'test', handled: false } }, { crashed: 1 }],
      ['exited for an exception that `beforeSend` drops', { beforeSend: () => null }, undefined, { exited: 1 }],
      ['errored for an exception that `sampleRate` drops', { sampleRate: 0 }, undefined, { errored: 1 }],
      [
        'errored for an exception that is processed after the request ended',
        { beforeSend: delayed },
        undefined,
        { errored: 1 },
      ],
    ] as const)('records the session as %s', async (_, options, hint, counts) => {
      client = new ServerRuntimeClient(getDefaultClientOptions({ dsn: PUBLIC_DSN, ...options }));
      const sendSessionSpy = vi.spyOn(client, 'sendSession');
      const endRequestSession = startRequestSession(client, { requestIsolationScope: getIsolationScope() });
      client.captureException(new Error('foo'), hint);
      endRequestSession();
      await client.flush();

      expect(sendSessionSpy).toHaveBeenCalledExactlyOnceWith({
        aggregates: [{ started: expect.any(String), exited: 0, errored: 0, crashed: 0, ...counts }],
      });
    });

    it('records sampled-out errors without taking a buffer slot from errors that are sent', async () => {
      client = new ServerRuntimeClient(
        getDefaultClientOptions({
          dsn: PUBLIC_DSN,
          sampleRate: 0,
          transportOptions: { bufferSize: 1 },
          beforeSend: delayed,
        }),
      );
      const sendEventSpy = vi.spyOn(client, 'sendEvent');
      const sendSessionSpy = vi.spyOn(client, 'sendSession');
      const endRequestSession = startRequestSession(client, { requestIsolationScope: getIsolationScope() });

      client.captureException(new Error('sampled out'));
      client.getOptions().sampleRate = 1;
      client.captureException(new Error('sampled in'));
      endRequestSession();
      await client.flush();

      expect(sendEventSpy).toHaveBeenCalledOnce();
      expect(sendSessionSpy).toHaveBeenCalledExactlyOnceWith({
        aggregates: [{ started: expect.any(String), exited: 0, errored: 1, crashed: 0 }],
      });
    });

    it('limits how many errors that are never sent run event processing at the same time', async () => {
      const beforeSend = vi.fn((event: ErrorEvent) => event);
      client = new ServerRuntimeClient(
        getDefaultClientOptions({
          dsn: PUBLIC_DSN,
          sampleRate: 0,
          beforeSend,
          transportOptions: { bufferSize: 2 },
          integrations: [new AsyncTestIntegration()],
          sendClientReports: true,
        }),
      );
      client.init();
      startRequestSession(client, { requestIsolationScope: getIsolationScope() });

      client.captureException(new Error('first'));
      client.captureException(new Error('second'));
      client.captureException(new Error('third'));
      await client.flush();

      expect(beforeSend).toHaveBeenCalledTimes(2);
      expect(client['_clearOutcomes']()).toEqual([{ reason: 'sample_rate', category: 'error', quantity: 3 }]);
    });

    it.each([
      ['synchronous', [dedupeIntegration()]],
      ['asynchronous', [new AsyncTestIntegration(), dedupeIntegration()]],
    ])(
      'crashes the request session for an unhandled duplicate in the same request, with %s processors before Dedupe',
      async (_, integrations) => {
        client = new ServerRuntimeClient(
          getDefaultClientOptions({ dsn: PUBLIC_DSN, integrations, sendClientReports: true }),
        );
        client.init();
        const sendEventSpy = vi.spyOn(client, 'sendEvent');
        startRequestSession(client, { requestIsolationScope: getIsolationScope() });

        client.captureException(new Error('duplicate'));
        client.captureException(new Error('duplicate'), { mechanism: { type: 'generic', handled: false } });
        await client.flush();

        expect(sendEventSpy).toHaveBeenCalledOnce();
        expect(getIsolationScope().getScopeData().sdkProcessingMetadata.requestSession?.status).toBe('crashed');
        expect(client['_clearOutcomes']()).toEqual([{ reason: 'event_processor', category: 'error', quantity: 1 }]);
      },
    );

    it('drops sampled-out errors before event processing once the request session crashed', () => {
      const beforeSend = vi.fn((event: ErrorEvent) => event);
      client = new ServerRuntimeClient(getDefaultClientOptions({ dsn: PUBLIC_DSN, sampleRate: 0, beforeSend }));
      startRequestSession(client, { requestIsolationScope: getIsolationScope() });

      client.captureException(new Error('crash'), { mechanism: { type: 'test', handled: false } });
      client.captureException(new Error('after crash'));

      expect(beforeSend).toHaveBeenCalledOnce();
      expect(getIsolationScope().getScopeData().sdkProcessingMetadata.requestSession?.status).toBe('crashed');
    });

    it('drops sampled-out handled errors before event processing once the request session errored', () => {
      const beforeSend = vi.fn((event: ErrorEvent) => event);
      client = new ServerRuntimeClient(getDefaultClientOptions({ dsn: PUBLIC_DSN, sampleRate: 0, beforeSend }));
      startRequestSession(client, { requestIsolationScope: getIsolationScope() });

      client.captureException(new Error('handled'));
      client.captureException(new Error('handled again'));
      client.captureException(new Error('crash'), { mechanism: { type: 'test', handled: false } });

      expect(beforeSend).toHaveBeenCalledTimes(2);
      expect(getIsolationScope().getScopeData().sdkProcessingMetadata.requestSession?.status).toBe('crashed');
    });

    it('records each request that fails with the same error as errored, also when Dedupe drops the error', async () => {
      client = new ServerRuntimeClient(
        getDefaultClientOptions({ dsn: PUBLIC_DSN, integrations: [dedupeIntegration()] }),
      );
      client.init();
      const sendEventSpy = vi.spyOn(client, 'sendEvent');
      const sendSessionSpy = vi.spyOn(client, 'sendSession');

      for (let i = 0; i < 2; i++) {
        captureErrorInRequest(client, 'same error');
      }
      await client.flush();

      expect(sendEventSpy).toHaveBeenCalledOnce();
      expect(sendSessionSpy).toHaveBeenCalledExactlyOnceWith({
        aggregates: [{ started: expect.any(String), exited: 0, errored: 2, crashed: 0 }],
      });
    });

    it('does not count a request whose duplicate error `beforeSend` drops', async () => {
      client = new ServerRuntimeClient(
        getDefaultClientOptions({
          dsn: PUBLIC_DSN,
          integrations: [dedupeIntegration()],
          beforeSend: event => (event.tags?.route === '/health' ? null : event),
        }),
      );
      client.init();
      const sendSessionSpy = vi.spyOn(client, 'sendSession');

      captureErrorInRequest(client, 'same error', '/users');
      captureErrorInRequest(client, 'same error', '/health');
      await client.flush();

      expect(sendSessionSpy).toHaveBeenCalledExactlyOnceWith({
        aggregates: [{ started: expect.any(String), exited: 1, errored: 1, crashed: 0 }],
      });
    });

    it('does not let duplicate errors from many requests push other errors out of the promise buffer', async () => {
      client = new ServerRuntimeClient(
        getDefaultClientOptions({
          dsn: PUBLIC_DSN,
          integrations: [dedupeIntegration(), new AsyncTestIntegration()],
          transportOptions: { bufferSize: 2 },
        }),
      );
      client.init();
      const sendEventSpy = vi.spyOn(client, 'sendEvent');

      for (let i = 0; i < 10; i++) {
        captureErrorInRequest(client, 'same error');
      }
      captureErrorInRequest(client, 'other error');
      await client.flush();

      expect(sendEventSpy).toHaveBeenCalledTimes(2);
    });

    it('calls `beforeSend` once for equal errors in one request', async () => {
      const beforeSend = vi.fn((event: ErrorEvent) => event);
      client = new ServerRuntimeClient(
        getDefaultClientOptions({ dsn: PUBLIC_DSN, integrations: [dedupeIntegration()], beforeSend }),
      );
      client.init();

      captureErrorInRequest(client, 'same error', '/users', 3);
      await client.flush();

      expect(beforeSend).toHaveBeenCalledOnce();
    });

    it('calls `beforeSend` once per request for equal errors from requests that run at the same time', async () => {
      const beforeSend = vi.fn(delayed);
      client = new ServerRuntimeClient(
        getDefaultClientOptions({ dsn: PUBLIC_DSN, integrations: [dedupeIntegration()], beforeSend }),
      );
      client.init();
      const firstRequest = new Scope();
      const secondRequest = new Scope();
      startRequestSession(client, { requestIsolationScope: firstRequest });
      startRequestSession(client, { requestIsolationScope: secondRequest });

      captureErrorInScope(client, 'same error', firstRequest);
      captureErrorInScope(client, 'same error', secondRequest);
      captureErrorInScope(client, 'same error', firstRequest);
      captureErrorInScope(client, 'same error', secondRequest);
      await client.flush();

      expect(beforeSend).toHaveBeenCalledTimes(2);
    });

    it('does not run event processing for sampled-out messages', () => {
      const beforeSend = vi.fn((event: ErrorEvent) => event);
      client = new ServerRuntimeClient(getDefaultClientOptions({ dsn: PUBLIC_DSN, sampleRate: 0, beforeSend }));
      startRequestSession(client, { requestIsolationScope: getIsolationScope() });

      client.captureMessage('message');

      expect(beforeSend).not.toHaveBeenCalled();
      expect(getIsolationScope().getScopeData().sdkProcessingMetadata.requestSession?.status).toBe('ok');
    });

    it.each([
      ['errored for a handled exception', undefined, 'errored'],
      ['crashed for an unhandled exception', { mechanism: { type: 'test', handled: false } }, 'crashed'],
    ] as const)('records a request whose error overflows the buffer as %s', (_, hint, status) => {
      client = new ServerRuntimeClient(
        getDefaultClientOptions({ dsn: PUBLIC_DSN, transportOptions: { bufferSize: 1 }, beforeSend: delayed }),
      );
      captureErrorInScope(client, 'takes the only buffer slot', new Scope());
      startRequestSession(client, { requestIsolationScope: getIsolationScope() });

      client.captureException(new Error('overflows'), hint);

      expect(getIsolationScope().getScopeData().sdkProcessingMetadata.requestSession?.status).toBe(status);
    });

    it.each([
      ['crashed when the first capture counted', delayed, 'crashed'],
      ['ok when `beforeSend` dropped the first capture', () => null, 'ok'],
    ] as const)('records a rethrown unhandled error as %s', async (_, beforeSend, status) => {
      client = new ServerRuntimeClient(getDefaultClientOptions({ dsn: PUBLIC_DSN, beforeSend }));
      startRequestSession(client, { requestIsolationScope: getIsolationScope() });
      const error = new Error('rethrown');

      client.captureException(error);
      client.captureException(error, { mechanism: { type: 'test', handled: false } });
      await client.flush();

      expect(getIsolationScope().getScopeData().sdkProcessingMetadata.requestSession?.status).toBe(status);
    });

    it('sends a session that settles during a flush, also when another request opened an aggregate', async () => {
      client = new ServerRuntimeClient(
        getDefaultClientOptions({
          dsn: PUBLIC_DSN,
          beforeSend: delayed,
        }),
      );
      const sendSessionSpy = vi.spyOn(client, 'sendSession');
      const endErroredRequestSession = startRequestSession(client, { requestIsolationScope: getIsolationScope() });
      client.captureException(new Error('foo'));
      endErroredRequestSession();

      const flushed = client.flush();
      startRequestSession(client, { requestIsolationScope: new Scope() })();
      await flushed;

      expect(sendSessionSpy).toHaveBeenCalledExactlyOnceWith({
        aggregates: [{ started: expect.any(String), exited: 0, errored: 1, crashed: 0 }],
      });
    });

    it('aggregates a session that settles after the request ended when no flush runs', async () => {
      client = new ServerRuntimeClient(getDefaultClientOptions({ dsn: PUBLIC_DSN, beforeSend: delayed }));
      const sendSessionSpy = vi.spyOn(client, 'sendSession');
      const endErroredRequestSession = startRequestSession(client, { requestIsolationScope: getIsolationScope() });
      client.captureException(new Error('foo'));
      endErroredRequestSession();
      await new Promise(resolve => setTimeout(resolve, 20));

      startRequestSession(client, { requestIsolationScope: new Scope() })();
      await client.flush();

      expect(sendSessionSpy).toHaveBeenCalledExactlyOnceWith({
        aggregates: [{ started: expect.any(String), exited: 1, errored: 1, crashed: 0 }],
      });
    });
  });

  describe('captureMessage', () => {
    it('sends a message event with level info', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      client = new ServerRuntimeClient(options);

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      client.captureMessage('foo');

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
      expect(sendEnvelopeSpy).toHaveBeenCalledWith([
        expect.any(Object),
        [
          [
            expect.any(Object),
            expect.objectContaining({
              level: 'info',
            }),
          ],
        ],
      ]);
    });
  });

  describe('user-agent header', () => {
    it('sends user-agent header with SDK name and version', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });

      // this is done in all `init` functions of the respective SDKs:
      applySdkMetadata(options, 'core');

      client = new ServerRuntimeClient(options);

      expect(client.getOptions().transportOptions?.headers).toEqual({
        'user-agent': 'sentry.javascript.core/0.0.0-unknown.0',
      });
    });

    it('prefers user-passed headers (including user-agent)', () => {
      const options = getDefaultClientOptions({
        dsn: PUBLIC_DSN,
        transportOptions: { headers: { 'x-custom-header': 'custom-value', 'user-agent': 'custom-user-agent' } },
      });

      applySdkMetadata(options, 'core');

      client = new ServerRuntimeClient(options);

      expect(client.getOptions().transportOptions?.headers).toEqual({
        'user-agent': 'custom-user-agent',
        'x-custom-header': 'custom-value',
      });
    });
  });

  describe('metrics processing', () => {
    it('adds server.address attribute to metrics when serverName is set', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN, serverName: 'my-server.example.com' });
      client = new ServerRuntimeClient(options);
      const scope = new Scope();
      scope.setClient(client);

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual(
        expect.objectContaining({
          'server.address': {
            value: 'my-server.example.com',
            type: 'string',
          },
        }),
      );
    });

    it('does not add server.address attribute when serverName is not set', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      client = new ServerRuntimeClient(options);
      const scope = new Scope();
      scope.setClient(client);

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).not.toEqual(
        expect.objectContaining({
          'server.address': expect.anything(),
        }),
      );
    });

    it('does not overwrite existing server.address attribute', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN, serverName: 'my-server.example.com' });
      client = new ServerRuntimeClient(options);
      const scope = new Scope();
      scope.setClient(client);

      _INTERNAL_captureMetric(
        {
          type: 'counter',
          name: 'test.metric',
          value: 1,
          attributes: { 'server.address': 'existing-server.example.com' },
        },
        { scope },
      );

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual(
        expect.objectContaining({
          'server.address': {
            value: 'existing-server.example.com',
            type: 'string',
          },
        }),
      );
    });
  });

  describe('dispose', () => {
    it('resets _promiseBuffer to a new empty buffer instead of undefined', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      client = new ServerRuntimeClient(options);

      // Access the private _promiseBuffer before dispose
      const originalBuffer = client['_promiseBuffer'];
      expect(originalBuffer).toBeDefined();

      client.dispose();

      // After dispose, _promiseBuffer should still be defined (not undefined)
      const bufferAfterDispose = client['_promiseBuffer'];
      expect(bufferAfterDispose).toBeDefined();
      expect(bufferAfterDispose).not.toBe(originalBuffer);
      // Verify it's a fresh buffer with no pending items
      expect(bufferAfterDispose.$).toEqual([]);
    });

    it('calls registered cleanup callbacks on dispose', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      client = new ServerRuntimeClient(options);

      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      const cleanup3 = vi.fn();

      client.registerCleanup(cleanup1);
      client.registerCleanup(cleanup2);
      client.registerCleanup(cleanup3);

      expect(cleanup1).not.toHaveBeenCalled();
      expect(cleanup2).not.toHaveBeenCalled();
      expect(cleanup3).not.toHaveBeenCalled();

      client.dispose();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
      expect(cleanup3).toHaveBeenCalledTimes(1);
    });

    it('clears cleanup callbacks after dispose', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      client = new ServerRuntimeClient(options);

      const cleanup = vi.fn();
      client.registerCleanup(cleanup);

      client.dispose();
      expect(cleanup).toHaveBeenCalledTimes(1);

      // Calling dispose again should not call cleanup again
      client.dispose();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('continues to call other cleanup callbacks if one throws', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      client = new ServerRuntimeClient(options);

      const cleanup1 = vi.fn();
      const throwingCleanup = vi.fn(() => {
        throw new Error('cleanup error');
      });
      const cleanup2 = vi.fn();

      client.registerCleanup(cleanup1);
      client.registerCleanup(throwingCleanup);
      client.registerCleanup(cleanup2);

      expect(() => client.dispose()).not.toThrow();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(throwingCleanup).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });
  });

  describe('registerCleanup', () => {
    it('accepts cleanup functions', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      client = new ServerRuntimeClient(options);

      const cleanup = vi.fn();

      expect(() => client.registerCleanup(cleanup)).not.toThrow();
    });

    it('can register multiple cleanup functions', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      client = new ServerRuntimeClient(options);

      const cleanups = Array.from({ length: 10 }, () => vi.fn());

      cleanups.forEach(cleanup => client.registerCleanup(cleanup));

      client.dispose();

      cleanups.forEach(cleanup => {
        expect(cleanup).toHaveBeenCalledTimes(1);
      });
    });
  });
});
