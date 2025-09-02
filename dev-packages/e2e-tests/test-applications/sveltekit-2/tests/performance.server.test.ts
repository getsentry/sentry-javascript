import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('server pageload request span has nested request span for sub request', async ({ page }) => {
  const serverTxnEventPromise = waitForTransaction('sveltekit-2', txnEvent => {
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
});

test('extracts HTTP request headers as span attributes', async ({ page, baseURL }) => {
  const serverTxnEventPromise = waitForTransaction('sveltekit-2', txnEvent => {
    return txnEvent?.transaction === 'GET /api/users';
  });

  await fetch(`${baseURL}/api/users`, {
    headers: {
      'User-Agent': 'Custom-SvelteKit-Agent/1.0',
      'Content-Type': 'application/json',
      'X-Test-Header': 'sveltekit-test-value',
      Accept: 'application/json',
      'X-Framework': 'SvelteKit',
      'X-Request-ID': 'sveltekit-123',
    },
  });

  const serverTxnEvent = await serverTxnEventPromise;

  expect(serverTxnEvent.contexts?.trace?.data).toEqual(
    expect.objectContaining({
      'http.request.header.user_agent': 'Custom-SvelteKit-Agent/1.0',
      'http.request.header.content_type': 'application/json',
      'http.request.header.x_test_header': 'sveltekit-test-value',
      'http.request.header.accept': 'application/json',
      'http.request.header.x_framework': 'SvelteKit',
      'http.request.header.x_request_id': 'sveltekit-123',
    }),
  );
});
