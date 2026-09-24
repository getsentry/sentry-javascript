import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// Origin links (`sentry.link.type: 'cache_origin'` on `cache.get` hit spans, pointing at the
// filling `cache.put`) for `use cache` in nested layout trees under `app/(cached-nesting)/`.
// Not implemented yet — every test is `test.fail()` with the final expected assertions.

// A `use cache` layout between dynamic segments. The layout entry is keyed by the awaited [id]
// param. If Next serves the entry from the prerendered shell (Resume Data Cache) instead of the
// cache handlers, there is no `cache.get` span at all — then this stays failing until Next
// exposes RDC reads.
test('links a cached layout hit to the trace that filled it', async ({ request }) => {
  test.fail();

  const id = crypto.randomUUID();

  const missTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /cached-mid-layout/[id]' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === false)
    );
  });

  const hitTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /cached-mid-layout/[id]' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true)
    );
  });

  await request.get(`/cached-mid-layout/${id}`);
  const missTx = await missTxPromise;

  await request.get(`/cached-mid-layout/${id}`);
  const hitTx = await hitTxPromise;

  // The layout is the only cached entry on this route.
  const putSpans = (missTx.spans ?? []).filter(span => span.op === 'cache.put');
  expect(new Set(putSpans.map(span => span.description)).size).toBe(1);

  const hitGetSpan = hitTx.spans?.find(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true);
  expect(hitGetSpan).toBeDefined();
  expect(hitGetSpan?.description).toBe(putSpans[0]!.description);
  expect(hitGetSpan?.links).toEqual([
    {
      trace_id: missTx.contexts?.trace?.trace_id,
      span_id: putSpans[0]!.span_id,
      sampled: true,
      attributes: { 'sentry.link.type': 'cache_origin' },
    },
  ]);
});

// Inverse nesting: all layouts above are dynamic, only the leaf component is cached — the leaf
// entry is the only span that carries a link.
test('links a cached leaf under dynamic layouts to the trace that filled it', async ({ request }) => {
  test.fail();

  const id = crypto.randomUUID();

  const missTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /dynamic-layouts/[id]/layout-cached-leaf' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === false)
    );
  });

  const hitTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /dynamic-layouts/[id]/layout-cached-leaf' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true)
    );
  });

  await request.get(`/dynamic-layouts/${id}/layout-cached-leaf`);
  const missTx = await missTxPromise;

  await request.get(`/dynamic-layouts/${id}/layout-cached-leaf`);
  const hitTx = await hitTxPromise;

  const putSpans = (missTx.spans ?? []).filter(span => span.op === 'cache.put');
  expect(new Set(putSpans.map(span => span.description)).size).toBe(1);

  const hitGetSpan = hitTx.spans?.find(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true);
  expect(hitGetSpan).toBeDefined();
  expect(hitGetSpan?.description).toBe(putSpans[0]!.description);
  expect(hitGetSpan?.links).toEqual([
    {
      trace_id: missTx.contexts?.trace?.trace_id,
      span_id: putSpans[0]!.span_id,
      sampled: true,
      attributes: { 'sentry.link.type': 'cache_origin' },
    },
  ]);
});

// Nested levels with different lifetimes: after the layout expired, request 2 refills the layout
// while the component still hits. Request 3 then hits both entries, and its two `cache.get`
// spans point at two different origin traces.
test('links two cached levels to different origin traces after the layout expires', async ({ request }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'Entries are only discarded at `expire` in production');
  test.fail();

  const id = crypto.randomUUID();

  const fillTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /mixed-lifetimes/[id]' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.put')
    );
  });

  await request.get(`/mixed-lifetimes/${id}`);
  const fillTx = await fillTxPromise;

  // Layout + component entry.
  const fillPutSpans = (fillTx.spans ?? []).filter(span => span.op === 'cache.put');
  expect(new Set(fillPutSpans.map(span => span.description)).size).toBe(2);

  // Sleep past the layout's `expire` (2s); the component entry stays valid for hours.
  await new Promise(resolve => setTimeout(resolve, 3_000));

  const refillTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /mixed-lifetimes/[id]' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.put') &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true)
    );
  });

  await request.get(`/mixed-lifetimes/${id}`);
  const refillTx = await refillTxPromise;

  const hitTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /mixed-lifetimes/[id]' &&
      (transactionEvent.spans?.filter(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true).length ??
        0) >= 2
    );
  });

  await request.get(`/mixed-lifetimes/${id}`);
  const hitTx = await hitTxPromise;

  const layoutPutSpan = refillTx.spans?.find(span => span.op === 'cache.put');
  expect(layoutPutSpan).toBeDefined();
  const componentPutSpan = fillPutSpans.find(span => span.description !== layoutPutSpan!.description);
  expect(componentPutSpan).toBeDefined();
  expect(refillTx.contexts?.trace?.trace_id).not.toBe(fillTx.contexts?.trace?.trace_id);

  const layoutHitSpan = hitTx.spans?.find(
    span => span.op === 'cache.get' && span.description === layoutPutSpan!.description,
  );
  expect(layoutHitSpan?.links).toEqual([
    {
      trace_id: refillTx.contexts?.trace?.trace_id,
      span_id: layoutPutSpan!.span_id,
      sampled: true,
      attributes: { 'sentry.link.type': 'cache_origin' },
    },
  ]);

  const componentHitSpan = hitTx.spans?.find(
    span => span.op === 'cache.get' && span.description === componentPutSpan!.description,
  );
  expect(componentHitSpan?.links).toEqual([
    {
      trace_id: fillTx.contexts?.trace?.trace_id,
      span_id: componentPutSpan!.span_id,
      sampled: true,
      attributes: { 'sentry.link.type': 'cache_origin' },
    },
  ]);
});

// Routes `a` and `b` share one layout entry: a hit on `b` links to the fill trace of `a`, so the
// origin is a different transaction than the serving one.
test('links a shared layout hit on a sibling route to the route that filled it', async ({ request }) => {
  test.fail();

  const id = crypto.randomUUID();

  const fillTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /shared-layout/[id]/a' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.put')
    );
  });

  await request.get(`/shared-layout/${id}/a`);
  const fillTx = await fillTxPromise;

  const hitTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /shared-layout/[id]/b' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true)
    );
  });

  await request.get(`/shared-layout/${id}/b`);
  const hitTx = await hitTxPromise;

  const putSpan = fillTx.spans?.find(span => span.op === 'cache.put');
  expect(putSpan).toBeDefined();

  const hitGetSpan = hitTx.spans?.find(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true);
  expect(hitGetSpan).toBeDefined();
  expect(hitGetSpan?.description).toBe(putSpan!.description);
  expect(hitGetSpan?.links).toEqual([
    {
      trace_id: fillTx.contexts?.trace?.trace_id,
      span_id: putSpan!.span_id,
      sampled: true,
      attributes: { 'sentry.link.type': 'cache_origin' },
    },
  ]);
});
