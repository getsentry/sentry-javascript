import { expect, test } from '@playwright/test';
import { getSpanOp, waitForRequest } from '@sentry-internal/test-utils';

test('does not capture Vercel AI v7 spans without nodejs_compat', async ({ baseURL }) => {
  // The transaction envelope also carries any extracted gen_ai spans as a span v2 container item,
  // so we wait for the whole envelope and assert neither place contains AI spans.
  const envelopePromise = waitForRequest('cloudflare-vercelai-v7-als', ({ envelope }) => {
    const transactionItem = envelope[1].find(([header]) => header.type === 'transaction');
    return (transactionItem?.[1] as any)?.transaction === 'GET /generate';
  });

  const response = await fetch(`${baseURL}/generate`);
  expect(response.status).toBe(200);

  const { envelope } = await envelopePromise;

  const transaction = envelope[1].find(([header]) => header.type === 'transaction')?.[1] as any;
  expect(transaction.transaction).toBe('GET /generate');
  expect(transaction.contexts?.trace?.op).toBe('http.server');

  // v7 uses diagnostics_channel which is not available with nodejs_als, so no AI spans should be
  // present — neither embedded in the transaction nor streamed as a span v2 container item.
  const embeddedAiSpans = (transaction.spans || []).filter(
    (span: any) => span.op?.startsWith('gen_ai.') || span.description?.includes('generateText'),
  );
  expect(embeddedAiSpans).toHaveLength(0);

  const streamedGenAiSpans = envelope[1]
    .filter(([header]) => header.type === 'span')
    .flatMap(([, payload]) => (payload as any).items ?? [])
    .filter((span: any) => getSpanOp(span)?.startsWith('gen_ai.'));
  expect(streamedGenAiSpans).toHaveLength(0);
});
