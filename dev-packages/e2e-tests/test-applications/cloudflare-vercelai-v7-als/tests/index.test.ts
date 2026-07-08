import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('does not capture Vercel AI v7 spans without nodejs_compat', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-vercelai-v7-als', txn => {
    return txn.transaction === 'GET /generate';
  });

  const response = await fetch(`${baseURL}/generate`);
  expect(response.status).toBe(200);

  const transaction = await transactionPromise;

  expect(transaction.transaction).toBe('GET /generate');
  expect(transaction.contexts?.trace?.op).toBe('http.server');

  // v7 uses diagnostics_channel which is not available with nodejs_als,
  // so no AI spans should be present.
  const aiSpans = (transaction.spans || []).filter(
    (span: any) => span.op?.startsWith('gen_ai.') || span.description?.includes('generateText'),
  );
  expect(aiSpans).toHaveLength(0);
});
