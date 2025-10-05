import { expect, test } from 'vitest';
import { conditionalTest } from '../../../utils';
import { createRunner } from '../../../utils/runner';
import { createTestServer } from '../../../utils/server';

// This test requires Node.js 22+ because it depends on the 'http.client.request.created'
// diagnostic channel for baggage header propagation, which only exists since Node 22.12.0+ and 23.2.0+
conditionalTest({ min: 22 })('node >=22', () => {
  test('adds current transaction name to baggage when the txn name is high-quality', async ({ signal }) => {
    expect.assertions(5);

    let traceId: string | undefined;

    const [SERVER_URL, closeTestServer] = await createTestServer({ signal })
      .get('/api/v0', (headers: Record<string, string | string[] | undefined>) => {
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
      .get('/api/v1', (headers: Record<string, string | string[] | undefined>) => {
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
      .get('/api/v2', (headers: Record<string, string | string[] | undefined>) => {
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
      .start();

    await createRunner({ signal }, __dirname, 'scenario-headers.ts')
      .withEnv({ SERVER_URL })
      .expect({
        transaction: {},
      })
      .start()
      .completed();
    closeTestServer();
  });
});

test('adds current transaction name to trace envelope header when the txn name is high-quality', async ({ signal }) => {
  expect.assertions(4);

  await createRunner({ signal }, __dirname, 'scenario-events.ts')
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
    .start()
    .completed();
});

function getBaggageHeaderItems(headers: Record<string, string | string[] | undefined>) {
  const baggage = headers['baggage'] as string;
  const baggageItems = baggage
    .split(',')
    .map(b => b.trim())
    .sort();
  return baggageItems;
}
