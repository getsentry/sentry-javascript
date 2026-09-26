import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// Background stale-while-revalidate refills. Target behavior: the revalidation runs in its own
// trace (not grafted onto the serving trace), links back to the request that triggered it, and
// becomes the `cache_origin` for future hits. Not implemented yet — the test is `test.fail()`.

test('runs background revalidation in its own trace linked to the triggering request', async ({ request }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'SWR revalidation timing only holds in production');
  test.fail();

  const id = crypto.randomUUID();

  const fillTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/use-cache-swr' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.put')
    );
  });

  await request.get(`/api/use-cache-swr?id=${id}`);
  const fillTx = await fillTxPromise;

  // Sleep past `revalidate` (2s) but not `expire`, so the next read serves the stale value and
  // triggers a background refill.
  await new Promise(resolve => setTimeout(resolve, 3_000));

  const staleHitTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/use-cache-swr' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true)
    );
  });

  const revalidationTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'cache.revalidate';
  });

  await request.get(`/api/use-cache-swr?id=${id}`);
  const staleHitTx = await staleHitTxPromise;

  const fillPutSpan = fillTx.spans?.find(span => span.op === 'cache.put');
  expect(fillPutSpan).toBeDefined();

  // The stale response still came from the original fill.
  const staleHitGetSpan = staleHitTx.spans?.find(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true);
  expect(staleHitGetSpan).toBeDefined();
  expect(staleHitGetSpan?.links).toEqual([
    {
      trace_id: fillTx.contexts?.trace?.trace_id,
      span_id: fillPutSpan!.span_id,
      sampled: true,
      attributes: { 'sentry.link.type': 'cache_origin' },
    },
  ]);

  // Refill work the visitor never waited for is not grafted onto the serving trace: the
  // background revalidation is its own trace, linked back to the request that triggered it.
  const revalidationTx = await revalidationTxPromise;
  expect(revalidationTx.contexts?.trace?.trace_id).not.toBe(staleHitTx.contexts?.trace?.trace_id);
  expect(revalidationTx.contexts?.trace?.links).toEqual([
    {
      trace_id: staleHitTx.contexts?.trace?.trace_id,
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
      sampled: true,
      // The link type for "revalidation triggered by" is not final yet; the target trace is.
      attributes: { 'sentry.link.type': expect.any(String) },
    },
  ]);

  const revalidationPutSpan = revalidationTx.spans?.find(span => span.op === 'cache.put');
  expect(revalidationPutSpan).toBeDefined();

  // The revalidation becomes the origin for future hits.
  const hitAfterRefillTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/use-cache-swr' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true)
    );
  });

  await request.get(`/api/use-cache-swr?id=${id}`);
  const hitAfterRefillTx = await hitAfterRefillTxPromise;

  const hitAfterRefillGetSpan = hitAfterRefillTx.spans?.find(
    span => span.op === 'cache.get' && span.data?.['cache.hit'] === true,
  );
  expect(hitAfterRefillGetSpan).toBeDefined();
  expect(hitAfterRefillGetSpan?.links).toEqual([
    {
      trace_id: revalidationTx.contexts?.trace?.trace_id,
      span_id: revalidationPutSpan!.span_id,
      sampled: true,
      attributes: { 'sentry.link.type': 'cache_origin' },
    },
  ]);
});
