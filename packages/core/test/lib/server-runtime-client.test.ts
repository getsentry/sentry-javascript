import type { Event, EventHint } from '../../src/types-hoist';

import { Scope, createTransport } from '../../src';
import type { ServerRuntimeClientOptions } from '../../src/server-runtime-client';
import { ServerRuntimeClient } from '../../src/server-runtime-client';

const PUBLIC_DSN = 'https://username@domain/123';

function getDefaultClientOptions(options: Partial<ServerRuntimeClientOptions> = {}): ServerRuntimeClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
    ...options,
  };
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

      const sendEnvelopeSpy = jest.spyOn(client, 'sendEnvelope');

      client.captureCheckIn({ monitorSlug: 'foo', status: 'in_progress' });

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe('captureException', () => {
    it('sends an exception event with level error', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      client = new ServerRuntimeClient(options);

      const sendEnvelopeSpy = jest.spyOn(client, 'sendEnvelope');

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

  describe('captureMessage', () => {
    it('sends a message event with level info', () => {
      const options = getDefaultClientOptions({ dsn: PUBLIC_DSN });
      client = new ServerRuntimeClient(options);

      const sendEnvelopeSpy = jest.spyOn(client, 'sendEnvelope');

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
});
