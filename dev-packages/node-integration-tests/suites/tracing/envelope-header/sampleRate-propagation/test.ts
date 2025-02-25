import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('tracesSampleRate propagation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const traceId = '12345678123456781234567812345678';

  test('uses sample rate from incoming baggage header in trace envelope item', async () => {
    const runner = createRunner(__dirname, 'server.js')
      .expectHeader({
        transaction: {
          trace: {
            sample_rate: '0.05',
            sampled: 'true',
            trace_id: traceId,
            transaction: 'myTransaction',
            sample_rand: '0.42',
          },
        },
      })
      .start();
    runner.makeRequest('get', '/test', {
      headers: {
        'sentry-trace': `${traceId}-1234567812345678-1`,
        baggage: `sentry-sample_rate=0.05,sentry-trace_id=${traceId},sentry-sampled=true,sentry-transaction=myTransaction,sentry-sample_rand=0.42`,
      },
    });
    await runner.completed();
  });
});
