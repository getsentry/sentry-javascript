import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// Origin links for `use cache` inside rendered pages (cached components and nested cached
// functions). Target behavior: a cache hit records a `cache.get` span carrying a
// `sentry.link.type: 'cache_origin'` span link to the `cache.put` span of the trace that filled
// the entry. Not implemented yet — every test is `test.fail()`.

// Two cached sibling components are two cache entries (props are part of the key), so one request
// carries one `cache.get` hit span per section, each linking to its own fill. The components sit
// in a dynamic hole: entries served from the prerendered shell (Resume Data Cache) never reach
// the cache handlers and produce no spans until Next.js exposes RDC reads.
test('links each sibling component hit to the fill of its own entry', async ({ request }) => {
  test.fail();

  const id = crypto.randomUUID();

  const missTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /cached-sibling-components' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === false)
    );
  });

  const hitTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /cached-sibling-components' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true)
    );
  });

  await request.get(`/cached-sibling-components?id=${id}`);
  const missTx = await missTxPromise;

  await request.get(`/cached-sibling-components?id=${id}`);
  const hitTx = await hitTxPromise;

  // Without span streaming, the key digest doubles as the span description, so it pairs a hit
  // with the put that filled the same entry.
  const putSpansByDigest = new Map(
    (missTx.spans ?? []).filter(span => span.op === 'cache.put').map(span => [span.description, span] as const),
  );
  expect(putSpansByDigest.size).toBe(2);

  const hitGetSpans = (hitTx.spans ?? []).filter(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true);
  // Deduplicated by entry because dev mode can render (and therefore read) more than once.
  expect(new Set(hitGetSpans.map(span => span.description)).size).toBe(2);

  for (const hitSpan of hitGetSpans) {
    const putSpan = putSpansByDigest.get(hitSpan.description);
    expect(putSpan).toBeDefined();
    expect(hitSpan.links).toEqual([
      {
        trace_id: missTx.contexts?.trace?.trace_id,
        span_id: putSpan!.span_id,
        sampled: true,
        attributes: { 'sentry.link.type': 'cache_origin' },
      },
    ]);
  }

  // The two sections link to two different fill spans, not to one shared origin.
  expect(new Set(hitGetSpans.map(span => span.links?.[0]?.span_id)).size).toBe(2);
});

test("links a nested cache hit inside another entry's refill to the original fill trace", async ({ request }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'Entries are only discarded at `expire` in production');
  test.fail();

  const id = crypto.randomUUID();

  const missTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /nested-caches' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.put')
    );
  });

  await request.get(`/nested-caches?id=${id}`);
  const missTx = await missTxPromise;

  // Sleep past the component entry's hard `expire` limit (2s); the nested function entry
  // (`cacheLife('hours')`) stays valid.
  await new Promise(resolve => setTimeout(resolve, 3_000));

  const refillTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /nested-caches' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true)
    );
  });

  await request.get(`/nested-caches?id=${id}`);
  const refillTx = await refillTxPromise;

  // The only hit is the nested function entry, read while the expired component entry refills.
  const hitGetSpans = (refillTx.spans ?? []).filter(
    span => span.op === 'cache.get' && span.data?.['cache.hit'] === true,
  );
  expect(hitGetSpans).toHaveLength(1);

  const nestedPutSpan = missTx.spans?.find(
    span => span.op === 'cache.put' && span.description === hitGetSpans[0]!.description,
  );
  expect(nestedPutSpan).toBeDefined();

  // Even though the read happens inside the component's isolated fill context, the link still
  // points at the trace that originally filled the nested entry.
  expect(hitGetSpans[0]!.links).toEqual([
    {
      trace_id: missTx.contexts?.trace?.trace_id,
      span_id: nestedPutSpan!.span_id,
      sampled: true,
      attributes: { 'sentry.link.type': 'cache_origin' },
    },
  ]);
});
