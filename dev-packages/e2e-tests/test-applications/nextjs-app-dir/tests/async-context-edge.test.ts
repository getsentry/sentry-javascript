import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should allow for async context isolation in the edge SDK', async ({ request }) => {
  const edgerouteTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /api/async-context-edge-endpoint' &&
      transactionEvent.contexts?.runtime?.name === 'vercel-edge'
    );
  });

  await request.get('/api/async-context-edge-endpoint');

  const asyncContextEdgerouteTransaction = await edgerouteTransactionPromise;

  const outerSpan = asyncContextEdgerouteTransaction.spans?.find(span => span.description === 'outer-span');
  const innerSpan = asyncContextEdgerouteTransaction.spans?.find(span => span.description === 'inner-span');

  expect(outerSpan?.parent_span_id).toStrictEqual(innerSpan?.parent_span_id);
});
