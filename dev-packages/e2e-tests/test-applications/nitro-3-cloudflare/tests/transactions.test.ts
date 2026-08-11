import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends an http.server transaction from the Cloudflare Workers runtime', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('nitro-3-cloudflare', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      (transactionEvent.request?.url?.endsWith('/api/') ?? false)
    );
  });

  const res = await request.get('/api/');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ hello: 'world' });

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace).toMatchObject({
    op: 'http.server',
    origin: 'auto.http.cloudflare',
  });
  expect(transactionEvent.sdk?.name).toBe('sentry.javascript.cloudflare');
});
