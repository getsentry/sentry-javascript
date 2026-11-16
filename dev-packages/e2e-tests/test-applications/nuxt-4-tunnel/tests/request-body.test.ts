import { expect, test } from '@playwright/test';
import { getRuntime, waitForError } from '@sentry-internal/test-utils';

test('keeps the body of a request that is not a tunnel request off its error event', async ({ request }) => {
  test.skip(getRuntime() !== 'cloudflare', 'Only the Cloudflare plugin decides which request bodies it passes on');
  const errorPromise = waitForError(
    'nuxt-4-tunnel',
    event => event.exception?.values?.[0]?.value === 'Tunnel test error',
  );

  await request.post('/app/api/error', { data: { note: 'stays off the event' }, headers: { 'x-auth': 'ok' } });
  const error = await errorPromise;

  expect(error.request?.method).toBe('POST');
  expect(error.request?.data).toBeUndefined();
});
