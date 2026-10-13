import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { RUNTIME } from './constants';

test.skip(RUNTIME !== 'cloudflare', 'Only the Cloudflare build has the Durable Object of Nitro');

test('traces the request that the Worker sends to the Durable Object of Nitro', async ({ request }) => {
  const workerSpanPromise = waitForStreamedSpan(
    'nuxt-4',
    span => span.is_segment === true && span.attributes['url.path']?.value === '/api/durable-object',
  );
  const durableObjectSpanPromise = waitForStreamedSpan(
    'nuxt-4',
    span => span.is_segment === true && span.attributes['url.path']?.value === '/api/durable-object/target',
  );

  const response = await request.get('/api/durable-object');
  expect(await response.json()).toEqual({ durable: true });

  const [workerSpan, durableObjectSpan] = await Promise.all([workerSpanPromise, durableObjectSpanPromise]);

  expect(getSpanOp(durableObjectSpan)).toBe('http.server');
  expect(durableObjectSpan.trace_id).toBe(workerSpan.trace_id);
});
