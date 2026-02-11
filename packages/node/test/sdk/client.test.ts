import { ProxyTracer } from '@opentelemetry/api';
import * as opentelemetryInstrumentationPackage from '@opentelemetry/instrumentation';
import type { Event, EventHint, Log } from '@sentry/core';
import { getCurrentScope, getGlobalScope, getIsolationScope, Scope, SDK_VERSION } from '@sentry/core';
import { setOpenTelemetryContextAsyncContextStrategy } from '@sentry/opentelemetry';
import * as os from 'os';
import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';
import { NodeClient } from '../../src';
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
    vi.restoreAllMocks();
    cleanupOtel();
  });

  it('sets correct metadata', () => {
    const options = getDefaultNodeClientOptions();
    const client = new NodeClient(options);

    expect(client.getOptions()).toEqual({
      dsn: expect.any(String),
      integrations: [],
      transport: options.transport,
      transportOptions: {
        headers: {
          'user-agent': `sentry.javascript.node/${SDK_VERSION}`,
        },
      },
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

  describe('_prepareEvent', () => {
    const currentScope = new Scope();
    const isolationScope = new Scope();

    test('adds platform to event', () => {
      const options = getDefaultNodeClientOptions({});
      const client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint, currentScope, isolationScope);

      expect(event.platform).toEqual('node');
    });

    test('adds runtime context to event', () => {
      const options = getDefaultNodeClientOptions({});
      const client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint, currentScope, isolationScope);

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
      client['_prepareEvent'](event, hint, currentScope, isolationScope);

      expect(event.server_name).toEqual('foo');
    });

    test('adds server name to event when value given in env', () => {
      const options = getDefaultNodeClientOptions({});
      process.env.SENTRY_NAME = 'foo';
      const client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint, currentScope, isolationScope);

      expect(event.server_name).toEqual('foo');

      delete process.env.SENTRY_NAME;
    });

    test('adds hostname as event server name when no value given', () => {
      const options = getDefaultNodeClientOptions({});
      const client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint, currentScope, isolationScope);

      expect(event.server_name).toEqual(os.hostname());
    });

    test('does not add hostname when includeServerName = false', () => {
      const options = getDefaultNodeClientOptions({});
      options.includeServerName = false;
      const client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint, currentScope, isolationScope);

      expect(event.server_name).toBeUndefined();
    });

    test("doesn't clobber existing runtime data", () => {
      const options = getDefaultNodeClientOptions({ serverName: 'bar' });
      const client = new NodeClient(options);

      const event: Event = { contexts: { runtime: { name: 'foo', version: '1.2.3' } } };
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint, currentScope, isolationScope);

      expect(event.contexts?.runtime).toEqual({ name: 'foo', version: '1.2.3' });
      expect(event.contexts?.runtime).not.toEqual({ name: 'node', version: process.version });
    });

    test("doesn't clobber existing server name", () => {
      const options = getDefaultNodeClientOptions({ serverName: 'bar' });
      const client = new NodeClient(options);

      const event: Event = { server_name: 'foo' };
      const hint: EventHint = {};
      client['_prepareEvent'](event, hint, currentScope, isolationScope);

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

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

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

      const sendEnvelopeSpy = vi.spyOn(client, 'sendEnvelope');

      client.captureCheckIn({ monitorSlug: 'foo', status: 'in_progress' });

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(0);
    });
  });

  it('registers instrumentations provided with `openTelemetryInstrumentations`', () => {
    const registerInstrumentationsSpy = vi
      .spyOn(opentelemetryInstrumentationPackage, 'registerInstrumentations')
      .mockImplementationOnce(() => () => undefined);
    const instrumentationsArray = ['foobar'] as unknown as opentelemetryInstrumentationPackage.Instrumentation[];

    new NodeClient(getDefaultNodeClientOptions({ openTelemetryInstrumentations: instrumentationsArray }));

    expect(registerInstrumentationsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        instrumentations: instrumentationsArray,
      }),
    );
  });

  describe('log capture', () => {
    it('adds server name to log attributes', () => {
      const options = getDefaultNodeClientOptions({ enableLogs: true });
      const client = new NodeClient(options);

      const log: Log = { level: 'info', message: 'test message', attributes: {} };
      client.emit('beforeCaptureLog', log);

      expect(log.attributes).toEqual({
        'server.address': expect.any(String),
      });
    });

    it('preserves existing log attributes', () => {
      const serverName = 'test-server';
      const options = getDefaultNodeClientOptions({ serverName, enableLogs: true });
      const client = new NodeClient(options);

      const log: Log = { level: 'info', message: 'test message', attributes: { 'existing.attr': 'value' } };
      client.emit('beforeCaptureLog', log);

      expect(log.attributes).toEqual({
        'existing.attr': 'value',
        'server.address': serverName,
      });
    });
  });
});
