import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('sends a server transaction from the standalone server', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-16-standalone', transactionEvent => {
    return transactionEvent.transaction === 'GET /';
  });

  await page.goto('/');

  const transactionEvent = await transactionPromise;
  expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
});

test('captures an error thrown in a route handler', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-16-standalone', errorEvent => {
    return errorEvent.exception?.values?.some(value => value.value === 'nextjs-16-standalone-server-error') ?? false;
  });

  const transactionEventPromise = waitForTransaction('nextjs-16-standalone', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/server-error' && transactionEvent.contexts?.trace?.op === 'http.server'
    );
  });

  request.get('/api/server-error').catch(() => {
    // expected to fail
  });

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionEventPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toBe('nextjs-16-standalone-server-error');
  expect(transactionEvent.contexts?.trace?.status).toBe('internal_error');
});
