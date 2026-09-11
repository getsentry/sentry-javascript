import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should create cache spans around `use cache` functions', async ({ request }) => {
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

  const firstResponse = await (await request.get(`/api/use-cache?id=${id}`)).json();
  const missTx = await missTxPromise;

  const secondResponse = await (await request.get(`/api/use-cache?id=${id}`)).json();
  const hitTx = await hitTxPromise;

  // The second request must have been served from the cache.
  expect(firstResponse.id).toBe(id);
  expect(secondResponse).toEqual(firstResponse);

  const missGetSpan = missTx.spans?.find(span => span.op === 'cache.get');
  expect(missGetSpan).toBeDefined();

  // Without span streaming, the key digest doubles as the span description.
  const cacheKeyDigest = missGetSpan!.data?.['cache.key'] as string[];
  expect(cacheKeyDigest).toEqual([expect.stringMatching(/^[0-9a-f]{12}$/)]);

  expect(missGetSpan).toMatchObject({
    description: cacheKeyDigest[0],
    origin: 'auto.cache.nextjs',
    data: expect.objectContaining({
      'cache.hit': false,
      'cache.operation': 'get',
    }),
  });

  const putSpan = missTx.spans?.find(span => span.op === 'cache.put');
  expect(putSpan).toBeDefined();
  expect(putSpan).toMatchObject({
    description: cacheKeyDigest[0],
    origin: 'auto.cache.nextjs',
    data: expect.objectContaining({
      'cache.key': cacheKeyDigest,
      'cache.operation': 'put',
    }),
  });

  const hitGetSpan = hitTx.spans?.find(span => span.op === 'cache.get');
  expect(hitGetSpan).toBeDefined();
  expect(hitGetSpan).toMatchObject({
    description: cacheKeyDigest[0],
    origin: 'auto.cache.nextjs',
    data: expect.objectContaining({
      'cache.hit': true,
      'cache.key': cacheKeyDigest,
      'cache.operation': 'get',
      'cache.item_age': expect.any(Number),
      // `cacheLife('hours')` sets `expire` to one day.
      'cache.ttl': 86400,
      'cache.tags': ['e2e-use-cache-tag'],
    }),
  });
});

test('Should create cache spans for `use cache` inside a rendered page', async ({ request }) => {
  const id = crypto.randomUUID();

  const missTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /use-cache-page' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === false)
    );
  });

  const hitTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /use-cache-page' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true)
    );
  });

  await request.get(`/use-cache-page?id=${id}`);
  const missTx = await missTxPromise;

  await request.get(`/use-cache-page?id=${id}`);
  const hitTx = await hitTxPromise;

  expect(missTx.spans?.some(span => span.op === 'cache.put')).toBe(true);

  // A render can read more than one cache entry, so look at every hit instead of the first `cache.get`.
  const hitGetSpans = hitTx.spans?.filter(span => span.op === 'cache.get' && span.data?.['cache.hit'] === true) ?? [];
  expect(hitGetSpans.length).toBeGreaterThan(0);
  for (const hitGetSpan of hitGetSpans) {
    expect(hitGetSpan).toMatchObject({
      origin: 'auto.cache.nextjs',
      data: expect.objectContaining({ 'cache.operation': 'get' }),
    });
  }
});

test('Should report an expired entry as a miss and refill it', async ({ request }) => {
  // The dev server serves `use cache` entries past their `expire` limit, so the expiry path only
  // exists in production builds.
  test.skip(process.env.TEST_ENV !== 'production', 'Entries only hard-expire in production');

  const id = crypto.randomUUID();

  const fillTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/use-cache-expiring' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.put')
    );
  });

  const firstResponse = await (await request.get(`/api/use-cache-expiring?id=${id}`)).json();
  await fillTxPromise;

  // Sleep past the entry's hard `expire` limit (2s), so the next read must discard it.
  await new Promise(resolve => setTimeout(resolve, 3_000));

  // Registered after the fill transaction was consumed, so it only matches the refill.
  const refillTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/use-cache-expiring' &&
      !!transactionEvent.spans?.some(span => span.op === 'cache.put')
    );
  });

  const secondResponse = await (await request.get(`/api/use-cache-expiring?id=${id}`)).json();
  const refillTx = await refillTxPromise;

  // The entry hard-expired, so the cached function ran again.
  expect(secondResponse.createdAt).not.toBe(firstResponse.createdAt);

  const refillGetSpan = refillTx.spans?.find(span => span.op === 'cache.get');
  expect(refillGetSpan).toBeDefined();
  expect(refillGetSpan!.data).toMatchObject({ 'cache.hit': false });
});
