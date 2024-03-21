import * as os from 'os';
import { ProxyTracer } from '@opentelemetry/api';
import {
  SDK_VERSION,
  SessionFlusher,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  withIsolationScope,
} from '@sentry/core';
import type { Event, EventHint } from '@sentry/types';
import type { Scope } from '@sentry/types';

import { setOpenTelemetryContextAsyncContextStrategy } from '@sentry/opentelemetry';
import { NodeClient, initOpenTelemetry } from '../../src';
import { getDefaultNodeClientOptions } from '../helpers/getDefaultNodeClientOptions';
import { cleanupOtel } from '../helpers/mockSdkInit';

describe('NodeClient', () => {
  beforeEach(() => {
    getIsolationScope().clear();
    getGlobalScope().clear();
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    setOpenTelemetryContextAsyncContextStrategy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    cleanupOtel();
  });

  it('sets correct metadata', () => {
    const options = getDefaultNodeClientOptions();
    const client = new NodeClient(options);

    expect(client.getOptions()).toEqual({
      dsn: expect.any(String),
      integrations: [],
      transport: options.transport,
      stackParser: options.stackParser,
      _metadata: {
        sdk: {
          name: 'sentry.javascript.node',
          packages: [
            {
              name: 'npm:@sentry/node',
              version: SDK_VERSION,
            },
          ],
          version: SDK_VERSION,
        },
      },
      platform: 'node',
      runtime: { name: 'node', version: expect.any(String) },
      serverName: expect.any(String),
      tracesSampleRate: 1,
    });
  });

  it('exposes a tracer', () => {
    const client = new NodeClient(getDefaultNodeClientOptions());

    const tracer = client.tracer;
    expect(tracer).toBeDefined();
    expect(tracer).toBeInstanceOf(ProxyTracer);

    // Ensure we always get the same tracer instance
    const tracer2 = client.tracer;

    expect(tracer2).toBe(tracer);
  });

  describe('captureException', () => {
    test('when autoSessionTracking is enabled, and requestHandler is not used -> requestStatus should not be set', () => {
      const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '1.4' });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      initOpenTelemetry(client);

      withIsolationScope(isolationScope => {
        isolationScope.setRequestSession({ status: 'ok' });

        client.captureException(new Error('test exception'));

        const requestSession = isolationScope.getRequestSession();
        expect(requestSession!.status).toEqual('ok');
      });
    });

    test('when autoSessionTracking is disabled -> requestStatus should not be set', () => {
      const options = getDefaultNodeClientOptions({ autoSessionTracking: false, release: '1.4' });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      initOpenTelemetry(client);

      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      withIsolationScope(isolationScope => {
        isolationScope.setRequestSession({ status: 'ok' });

        client.captureException(new Error('test exception'));

        const requestSession = isolationScope.getRequestSession();
        expect(requestSession!.status).toEqual('ok');
      });
    });

    test('when autoSessionTracking is enabled + requestSession status is Crashed -> requestStatus should not be overridden', () => {
      const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '1.4' });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      initOpenTelemetry(client);

      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      withIsolationScope(isolationScope => {
        isolationScope.setRequestSession({ status: 'crashed' });

        client.captureException(new Error('test exception'));

        const requestSession = isolationScope.getRequestSession();
        expect(requestSession!.status).toEqual('crashed');
      });
    });

    test('when autoSessionTracking is enabled + error occurs within request bounds -> requestStatus should be set to Errored', () => {
      const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '1.4' });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      initOpenTelemetry(client);

      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      withIsolationScope(isolationScope => {
        isolationScope.setRequestSession({ status: 'ok' });

        client.captureException(new Error('test exception'));

        const requestSession = isolationScope.getRequestSession();
        expect(requestSession!.status).toEqual('errored');
      });
    });

    test('when autoSessionTracking is enabled + error occurs outside of request bounds -> requestStatus should not be set to Errored', done => {
      const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '1.4' });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      initOpenTelemetry(client);

      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      let isolationScope: Scope;
      withIsolationScope(_isolationScope => {
        _isolationScope.setRequestSession({ status: 'ok' });
        isolationScope = _isolationScope;
      });

      client.captureException(new Error('test exception'));

      setImmediate(() => {
        const requestSession = isolationScope.getRequestSession();
        expect(requestSession).toEqual({ status: 'ok' });
        done();
      });
    });
  });

  describe('captureEvent()', () => {
    test('If autoSessionTracking is disabled, requestSession status should not be set', () => {
      const options = getDefaultNodeClientOptions({ autoSessionTracking: false, release: '1.4' });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      initOpenTelemetry(client);

      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      withIsolationScope(isolationScope => {
        isolationScope.setRequestSession({ status: 'ok' });
        client.captureEvent({ message: 'message', exception: { values: [{ type: 'exception type 1' }] } });
        const requestSession = isolationScope.getRequestSession();
        expect(requestSession!.status).toEqual('ok');
      });
    });

    test('When captureEvent is called with an exception, requestSession status should be set to Errored', () => {
      const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '2.2' });
      const client = new NodeClient(options);
      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      withIsolationScope(isolationScope => {
        isolationScope.setRequestSession({ status: 'ok' });

        client.captureEvent({ message: 'message', exception: { values: [{ type: 'exception type 1' }] } });

        const requestSession = isolationScope.getRequestSession();
        expect(requestSession!.status).toEqual('errored');
      });
    });

    test('When captureEvent is called without an exception, requestSession status should not be set to Errored', () => {
      const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '2.2' });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      initOpenTelemetry(client);

      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      withIsolationScope(isolationScope => {
        isolationScope.setRequestSession({ status: 'ok' });

        client.captureEvent({ message: 'message' });

        const requestSession = isolationScope.getRequestSession();
        expect(requestSession!.status).toEqual('ok');
      });
    });

    test('When captureEvent is called with an exception but outside of a request, then requestStatus should not be set', () => {
      const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '2.2' });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      initOpenTelemetry(client);

      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      withIsolationScope(isolationScope => {
        isolationScope.clear();
        client.captureEvent({ message: 'message', exception: { values: [{ type: 'exception type 1' }] } });

        expect(isolationScope.getRequestSession()).toEqual(undefined);
      });
    });

    test('When captureEvent is called with a transaction, then requestSession status should not be set', () => {
      const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '1.3' });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      initOpenTelemetry(client);

      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      withIsolationScope(isolationScope => {
        isolationScope.setRequestSession({ status: 'ok' });

        client.captureEvent({ message: 'message', type: 'transaction' });

        const requestSession = isolationScope.getRequestSession();
        expect(requestSession!.status).toEqual('ok');
      });
    });

    test('When captureEvent is called with an exception but requestHandler is not used, then requestSession status should not be set', () => {
      const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '1.3' });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      initOpenTelemetry(client);

      withIsolationScope(isolationScope => {
        isolationScope.setRequestSession({ status: 'ok' });

        client.captureEvent({ message: 'message', exception: { values: [{ type: 'exception type 1' }] } });

        const requestSession = isolationScope.getRequestSession();
        expect(requestSession!.status).toEqual('ok');
      });
    });
  });

  describe('_prepareEvent', () => {
    test('adds platform to event', () => {
      const options = getDefaultNodeClientOptions({});
      const client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint);

      expect(event.platform).toEqual('node');
    });

    test('adds runtime context to event', () => {
      const options = getDefaultNodeClientOptions({});
      const client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint);

      expect(event.contexts?.runtime).toEqual({
        name: 'node',
        version: process.version,
      });
    });

    test('adds server name to event when value passed in options', () => {
      const options = getDefaultNodeClientOptions({ serverName: 'foo' });
      const client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint);

      expect(event.server_name).toEqual('foo');
    });

    test('adds server name to event when value given in env', () => {
      const options = getDefaultNodeClientOptions({});
      process.env.SENTRY_NAME = 'foo';
      const client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint);

      expect(event.server_name).toEqual('foo');

      delete process.env.SENTRY_NAME;
    });

    test('adds hostname as event server name when no value given', () => {
      const options = getDefaultNodeClientOptions({});
      const client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint);

      expect(event.server_name).toEqual(os.hostname());
    });

    test("doesn't clobber existing runtime data", () => {
      const options = getDefaultNodeClientOptions({ serverName: 'bar' });
      const client = new NodeClient(options);

      const event: Event = { contexts: { runtime: { name: 'foo', version: '1.2.3' } } };
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint);

      expect(event.contexts?.runtime).toEqual({ name: 'foo', version: '1.2.3' });
      expect(event.contexts?.runtime).not.toEqual({ name: 'node', version: process.version });
    });

    test("doesn't clobber existing server name", () => {
      const options = getDefaultNodeClientOptions({ serverName: 'bar' });
      const client = new NodeClient(options);

      const event: Event = { server_name: 'foo' };
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint);

      expect(event.server_name).toEqual('foo');
      expect(event.server_name).not.toEqual('bar');
    });
  });

  describe('captureCheckIn', () => {
    it('sends a checkIn envelope', () => {
      const options = getDefaultNodeClientOptions({
        serverName: 'bar',
        release: '1.0.0',
        environment: 'dev',
      });
      const client = new NodeClient(options);

      const sendEnvelopeSpy = jest.spyOn(client, 'sendEnvelope');

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

    it('sends a checkIn envelope for heartbeat checkIns', () => {
      const options = getDefaultNodeClientOptions({
        serverName: 'server',
        release: '1.0.0',
        environment: 'dev',
      });
      const client = new NodeClient(options);

      const sendEnvelopeSpy = jest.spyOn(client, 'sendEnvelope');

      const id = client.captureCheckIn({ monitorSlug: 'heartbeat-monitor', status: 'ok' });

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
      expect(sendEnvelopeSpy).toHaveBeenCalledWith([
        expect.any(Object),
        [
          [
            expect.any(Object),
            {
              check_in_id: id,
              monitor_slug: 'heartbeat-monitor',
              status: 'ok',
              release: '1.0.0',
              environment: 'dev',
            },
          ],
        ],
      ]);
    });

    it('does not send a checkIn envelope if disabled', () => {
      const options = getDefaultNodeClientOptions({ serverName: 'bar', enabled: false });
      const client = new NodeClient(options);

      const sendEnvelopeSpy = jest.spyOn(client, 'sendEnvelope');

      client.captureCheckIn({ monitorSlug: 'foo', status: 'in_progress' });

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(0);
    });
  });
});

describe('flush/close', () => {
  test('client close function disables _sessionFlusher', async () => {
    jest.useRealTimers();

    const options = getDefaultNodeClientOptions({
      autoSessionTracking: true,
      release: '1.1',
    });
    const client = new NodeClient(options);
    client.initSessionFlusher();
    // Clearing interval is important here to ensure that the flush function later on is called by the `client.close()`
    // not due to the interval running every 60s
    clearInterval(client['_sessionFlusher']!['_intervalId']);

    const sessionFlusherFlushFunc = jest.spyOn(SessionFlusher.prototype, 'flush');

    const delay = 1;
    await client.close(delay);

    expect(client['_sessionFlusher']!['_isEnabled']).toBeFalsy();
    expect(sessionFlusherFlushFunc).toHaveBeenCalledTimes(1);
  });
});
