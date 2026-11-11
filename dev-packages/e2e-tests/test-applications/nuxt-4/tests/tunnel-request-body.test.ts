import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

test('keeps the body of a request that is not a tunnel request off its error event', async ({ request }) => {
  const errorPromise = waitForError('nuxt-4', event => event.exception?.values?.[0]?.value === 'POST error');

  await request.post(`${process.env.E2E_TEST_BASE_PATH ?? ''}/api/post-error`, {
    data: { note: 'stays off the event' },
    // Passes the auth middleware of the tunnel variant.
    headers: { 'x-auth': 'ok' },
  });
  const error = await errorPromise;

  expect(error.request?.method).toBe('POST');
  expect(error.request?.data).toBeUndefined();
});
