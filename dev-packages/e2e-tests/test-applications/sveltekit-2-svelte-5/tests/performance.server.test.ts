import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('server pageload request span has nested request span for sub request', async ({ page }) => {
  const serverTxnEventPromise = waitForTransaction('sveltekit-2-svelte-5', txnEvent => {
    return txnEvent?.transaction === 'GET /server-load-fetch';
  });

  await page.goto('/server-load-fetch');

  const serverTxnEvent = await serverTxnEventPromise;
  const spans = serverTxnEvent.spans;

  expect(serverTxnEvent).toMatchObject({
    transaction: 'GET /server-load-fetch',
    transaction_info: { source: 'route' },
    type: 'transaction',
    contexts: {
      trace: {
        op: 'http.server',
        origin: 'auto.http.sveltekit',
      },
    },
  });

  expect(spans).toEqual(
    expect.arrayContaining([
      // load span where the server load function initiates the sub request:
      expect.objectContaining({ op: 'function.sveltekit.server.load', description: '/server-load-fetch' }),
      // sub request span:
      expect.objectContaining({ op: 'http.server', description: 'GET /api/users' }),
    ]),
  );

  expect(serverTxnEvent.request).toEqual({
    cookies: {},
    headers: expect.objectContaining({
      accept: expect.any(String),
      'user-agent': expect.any(String),
    }),
    method: 'GET',
    url: 'http://localhost:3030/server-load-fetch',
  });
});
