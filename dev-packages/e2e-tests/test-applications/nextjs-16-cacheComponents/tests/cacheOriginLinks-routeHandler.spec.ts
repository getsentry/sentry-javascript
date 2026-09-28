import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// Origin links for `use cache` in route handlers. Target behavior: a cache hit records a
// `cache.get` span carrying a `sentry.link.type: 'cache_origin'` span link to the `cache.put`
// span of the trace that filled the entry; unknown origin means no link. Not implemented yet —
// every test is `test.fail()`; shipping the feature should only require deleting those lines.

test('links a route handler cache hit to the trace that filled the entry', async ({ request }) => {
  test.fail();

  // A fresh id makes the first request a guaranteed cache miss (the id is part of the cache key)
  // even when the test is retried against the same server.
  const id = crypto.randomUUID();

  const missTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/use-cache' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === false)
    );
  });

  const hitTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/use-cache' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true)
    );
  });

  await request.get(`/api/use-cache?id=${id}`);
  const missTx = await missTxPromise;

  await request.get(`/api/use-cache?id=${id}`);
  const hitTx = await hitTxPromise;

  const putSpan = missTx.spans?.find(span => span.op === 'cache.put');
  expect(putSpan).toBeDefined();

  // A miss has no origin, and the SDK never guesses one.
  const missGetSpan = missTx.spans?.find(span => span.op === 'cache.get');
  expect(missGetSpan?.links).toBeUndefined();
  expect(putSpan?.links).toBeUndefined();

  const hitGetSpan = hitTx.spans?.find(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true);
  expect(hitGetSpan).toBeDefined();
  expect(hitGetSpan?.links).toEqual([
    {
      trace_id: missTx.contexts?.trace?.trace_id,
      span_id: putSpan!.span_id,
      sampled: true,
      attributes: { 'sentry.link.type': 'cache_origin' },
    },
  ]);
});

test('moves the origin link to the refill trace after the entry expires', async ({ request }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'Entries are only discarded at `expire` in production');
  test.fail();

  const id = crypto.randomUUID();

  const fillTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/use-cache-expiring' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.put')
    );
  });

  await request.get(`/api/use-cache-expiring?id=${id}`);
  const fillTx = await fillTxPromise;

  // Sleep past the entry's hard `expire` limit (2s), so the next read must discard and refill it.
  await new Promise(resolve => setTimeout(resolve, 3_000));

  // Registered after the fill transaction was consumed, so it only matches the refill.
  const refillTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/use-cache-expiring' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.put')
    );
  });

  await request.get(`/api/use-cache-expiring?id=${id}`);
  const refillTx = await refillTxPromise;

  const hitTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/use-cache-expiring' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true)
    );
  });

  await request.get(`/api/use-cache-expiring?id=${id}`);
  const hitTx = await hitTxPromise;

  expect(refillTx.contexts?.trace?.trace_id).not.toBe(fillTx.contexts?.trace?.trace_id);

  const refillPutSpan = refillTx.spans?.find(span => span.op === 'cache.put');
  expect(refillPutSpan).toBeDefined();

  // The hit read the refilled entry, so the link points at the refill trace, not the first fill.
  const hitGetSpan = hitTx.spans?.find(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true);
  expect(hitGetSpan).toBeDefined();
  expect(hitGetSpan?.links).toEqual([
    {
      trace_id: refillTx.contexts?.trace?.trace_id,
      span_id: refillPutSpan!.span_id,
      sampled: true,
      attributes: { 'sentry.link.type': 'cache_origin' },
    },
  ]);
});
