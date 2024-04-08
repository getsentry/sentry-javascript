import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/event-proxy-server';

test('Should allow for async context isolation in the edge SDK', async ({ request }) => {
  // test.skip(process.env.TEST_ENV === 'development', "Doesn't work in dev mode.");

  const edgerouteTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /api/async-context-edge-endpoint';
  });

  await request.get('/api/async-context-edge-endpoint');

  const asyncContextEdgerouteTransaction = await edgerouteTransactionPromise;

  const outerSpan = asyncContextEdgerouteTransaction.spans?.find(span => span.description === 'outer-span');
  const innerSpan = asyncContextEdgerouteTransaction.spans?.find(span => span.description === 'inner-span');

  // @ts-expect-error parent_span_id exists
  expect(outerSpan?.parent_span_id).toStrictEqual(asyncContextEdgerouteTransaction.contexts?.trace?.span_id);
  // @ts-expect-error parent_span_id exists
  expect(innerSpan?.parent_span_id).toStrictEqual(asyncContextEdgerouteTransaction.contexts?.trace?.span_id);
});
