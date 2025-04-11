import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends server-side transactions to Sentry', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('create-next-app', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/success'
    );
  });

  await fetch(`${baseURL}/api/success`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: 'GET /api/success',
      transaction_info: { source: 'route' },
      type: 'transaction',
      contexts: expect.objectContaining({
        trace: {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          op: 'http.server',
          origin: 'auto.http.nextjs',
          data: expect.objectContaining({
            'http.response.status_code': 200,
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.nextjs',
            'sentry.sample_rate': 1,
            'sentry.source': 'route',
          }),
          status: 'ok',
        },
      }),
      spans: [
        {
          data: {
            'sentry.origin': 'manual',
          },
          description: 'test-span',
          origin: 'manual',
          parent_span_id: transactionEvent.contexts?.trace?.span_id,
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: transactionEvent.contexts?.trace?.trace_id,
        },
      ],
      request: {
        headers: expect.any(Object),
        method: 'GET',
        cookies: {},
        url: expect.stringContaining('/api/success'),
      },
    }),
  );
});
