import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Transaction includes span for decorated function', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nestjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-span-decorator'
    );
  });

  await fetch(`${baseURL}/test-span-decorator`);

  const transactionEvent = await transactionEventPromise;

  console.log(transactionEvent);

  expect(transactionEvent.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        span_id: expect.any(String),
        trace_id: expect.any(String),
        data: expect.any(Object),
        description: 'wait',
        parent_span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        status: 'ok',
        op: 'wait function',
        origin: 'manual',
      }),
    ]),
  );
});
