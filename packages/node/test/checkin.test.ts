import { createCheckInEnvelope } from '../src/checkin';

describe('userFeedback', () => {
  test('creates user feedback envelope header', () => {
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

  test('creates user feedback envelope item', () => {
    const envelope = createCheckInEnvelope({
      check_in_id: '83a7c03ed0a04e1b97e2e3b18d38f244',
      monitor_slug: 'b7645b8e-b47d-4398-be9a-d16b0dac31cb',
      status: 'ok',
      duration: 10.0,
      release: '1.0.0',
      environment: 'production',
    });

    expect(envelope[1]).toEqual([
      [
        {
          type: 'check_in',
        },
        {
          check_in_id: '83a7c03ed0a04e1b97e2e3b18d38f244',
          monitor_slug: 'b7645b8e-b47d-4398-be9a-d16b0dac31cb',
          status: 'ok',
          duration: 10.0,
          release: '1.0.0',
          environment: 'production',
        },
      ],
    ]);
  });
});
