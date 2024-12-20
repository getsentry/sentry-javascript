import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should create a transaction that has the same trace ID as the incoming request', async ({ request }) => {
  const transactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /api/trace-propagation';
  });

  await request.get('/api/trace-propagation', {
    headers: {
      'sentry-trace': '8ef4a40df2063cb023c93cbeb04d68c3-acf68e4724b58822-1',
    },
  });

  expect((await transactionPromise).contexts?.trace).toBe(
    expect.objectContaining({
      trace_id: '8ef4a40df2063cb023c93cbeb04d68c3',
      parent_span_id: 'acf68e4724b58822',
    }),
  );
});
