import type { SerializedCheckIn } from '@sentry/types';

import { createCheckInEnvelope } from '../src/checkin';

describe('CheckIn', () => {
  test('creates a check in envelope header', () => {
    const envelope = createCheckInEnvelope(
      {
        check_in_id: '83a7c03ed0a04e1b97e2e3b18d38f244',
        monitor_slug: 'b7645b8e-b47d-4398-be9a-d16b0dac31cb',
        status: 'in_progress',
      },
      {
        sdk: {
          name: 'testSdkName',
          version: 'testSdkVersion',
        },
      },
      'testTunnel',
      {
        host: 'testHost',
        projectId: 'testProjectId',
        protocol: 'http',
      },
    );

    expect(envelope[0]).toEqual({
      dsn: 'http://undefined@testHost/undefinedtestProjectId',
      sdk: {
        name: 'testSdkName',
        version: 'testSdkVersion',
      },
      sent_at: expect.any(String),
    });
  });

  test.each([
    [
      'no monitor config',
      {
        check_in_id: '83a7c03ed0a04e1b97e2e3b18d38f244',
        monitor_slug: 'b7645b8e-b47d-4398-be9a-d16b0dac31cb',
        status: 'ok',
        duration: 10.0,
        release: '1.0.0',
        environment: 'production',
      } as SerializedCheckIn,
      {
        check_in_id: '83a7c03ed0a04e1b97e2e3b18d38f244',
        monitor_slug: 'b7645b8e-b47d-4398-be9a-d16b0dac31cb',
        status: 'ok',
        duration: 10.0,
        release: '1.0.0',
        environment: 'production',
      },
    ],
    [
      'crontab monitor config',
      {
        check_in_id: '83a7c03ed0a04e1b97e2e3b18d38f244',
        monitor_slug: 'b7645b8e-b47d-4398-be9a-d16b0dac31cb',
        status: 'in_progress',
        monitor_config: {
          schedule: {
            type: 'crontab',
            value: '0 * * * *',
          },
          checkin_margin: 5,
          max_runtime: 30,
          timezone: 'America/Los_Angeles',
        },
      } as SerializedCheckIn,
      {
        check_in_id: '83a7c03ed0a04e1b97e2e3b18d38f244',
        monitor_slug: 'b7645b8e-b47d-4398-be9a-d16b0dac31cb',
        status: 'in_progress',
        monitor_config: {
          schedule: {
            type: 'crontab',
            value: '0 * * * *',
          },
          checkin_margin: 5,
          max_runtime: 30,
          timezone: 'America/Los_Angeles',
        },
      },
    ],
    [
      'interval monitor config',
      {
        check_in_id: '83a7c03ed0a04e1b97e2e3b18d38f244',
        monitor_slug: 'b7645b8e-b47d-4398-be9a-d16b0dac31cb',
        status: 'in_progress',
        monitor_config: {
          schedule: {
            type: 'interval',
            value: 1234,
            unit: 'minute',
          },
        },
      } as SerializedCheckIn,
      {
        check_in_id: '83a7c03ed0a04e1b97e2e3b18d38f244',
        monitor_slug: 'b7645b8e-b47d-4398-be9a-d16b0dac31cb',
        status: 'in_progress',
        monitor_config: {
          schedule: {
            type: 'interval',
            value: 1234,
            unit: 'minute',
          },
        },
      },
    ],
  ])('creates a check in envelope header with %s', (_, checkIn, envelopeItem) => {
    const envelope = createCheckInEnvelope(checkIn);

    expect(envelope[1]).toEqual([
      [
        {
          type: 'check_in',
        },
        envelopeItem,
      ],
    ]);
  });
});
