import { createRunner } from '../../../utils/runner';
import { createTestServer } from '../../../utils/server';

test('adds current transaction name to baggage when the txn name is high-quality', done => {
  expect.assertions(5);

  let traceId: string | undefined;

  createTestServer(done)
    .get('/api/v0', headers => {
      const baggageItems = getBaggageHeaderItems(headers);
      traceId = baggageItems.find(item => item.startsWith('sentry-trace_id='))?.split('=')[1] as string;

      expect(traceId).toMatch(/^[0-9a-f]{32}$/);

      expect(baggageItems).toEqual([
        'sentry-environment=production',
        'sentry-public_key=public',
        'sentry-release=1.0',
        expect.stringMatching(/sentry-sample_rand=0\.[0-9]+/),
        'sentry-sample_rate=1',
        'sentry-sampled=true',
        `sentry-trace_id=${traceId}`,
      ]);
    })
    .get('/api/v1', headers => {
      expect(getBaggageHeaderItems(headers)).toEqual([
        'sentry-environment=production',
        'sentry-public_key=public',
        'sentry-release=1.0',
        expect.stringMatching(/sentry-sample_rand=0\.[0-9]+/),
        'sentry-sample_rate=1',
        'sentry-sampled=true',
        `sentry-trace_id=${traceId}`,
        'sentry-transaction=updated-name-1',
      ]);
    })
    .get('/api/v2', headers => {
      expect(getBaggageHeaderItems(headers)).toEqual([
        'sentry-environment=production',
        'sentry-public_key=public',
        'sentry-release=1.0',
        expect.stringMatching(/sentry-sample_rand=0\.[0-9]+/),
        'sentry-sample_rate=1',
        'sentry-sampled=true',
        `sentry-trace_id=${traceId}`,
        'sentry-transaction=updated-name-2',
      ]);
    })
    .start()
    .then(([SERVER_URL, closeTestServer]) => {
      createRunner(__dirname, 'scenario-headers.ts')
        .withEnv({ SERVER_URL })
        .expect({
          transaction: {},
        })
        .start(closeTestServer);
    });
});

test('adds current transaction name to trace envelope header when the txn name is high-quality', done => {
  expect.assertions(4);

  createRunner(__dirname, 'scenario-events.ts')
    .expectHeader({
      event: {
        trace: {
          environment: 'production',
          public_key: 'public',
          release: '1.0',
          sample_rate: '1',
          sampled: 'true',
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          sample_rand: expect.any(String),
        },
      },
    })
    .expectHeader({
      event: {
        trace: {
          environment: 'production',
          public_key: 'public',
          release: '1.0',
          sample_rate: '1',
          sampled: 'true',
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          transaction: 'updated-name-1',
          sample_rand: expect.any(String),
        },
      },
    })
    .expectHeader({
      event: {
        trace: {
          environment: 'production',
          public_key: 'public',
          release: '1.0',
          sample_rate: '1',
          sampled: 'true',
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          transaction: 'updated-name-2',
          sample_rand: expect.any(String),
        },
      },
    })
    .expectHeader({
      transaction: {
        trace: {
          environment: 'production',
          public_key: 'public',
          release: '1.0',
          sample_rate: '1',
          sampled: 'true',
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          transaction: 'updated-name-2',
          sample_rand: expect.any(String),
        },
      },
    })
    .start(done);
});

function getBaggageHeaderItems(headers: Record<string, string | string[] | undefined>) {
  const baggage = headers['baggage'] as string;
  const baggageItems = baggage
    .split(',')
    .map(b => b.trim())
    .sort();
  return baggageItems;
}
