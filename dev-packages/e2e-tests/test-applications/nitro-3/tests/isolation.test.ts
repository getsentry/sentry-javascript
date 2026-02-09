import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Isolation scope prevents tag leaking between requests', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('nitro-3', event => {
    return event?.transaction === 'GET /test-isolation/1';
  });

  const errorPromise = waitForError('nitro-3', event => {
    return !event.type && event.exception?.values?.some(v => v.value === 'Isolation test error');
  });

  await request.get('/test-isolation/1').catch(() => {
    // noop - route throws
  });

  const transactionEvent = await transactionEventPromise;
  const error = await errorPromise;

  // Assert that isolation scope works properly
  expect(error.tags?.['my-isolated-tag']).toBe(true);
  expect(error.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
  expect(transactionEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(transactionEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});
