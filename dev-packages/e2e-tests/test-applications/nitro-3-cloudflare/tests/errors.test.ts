import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('sends an error event from the Cloudflare Workers runtime', async ({ request }) => {
  const errorEventPromise = waitForError('nitro-3-cloudflare', event => {
    return !event.type && !!event.exception?.values?.some(v => v.value === 'This is a test error');
  });

  const res = await request.get('/api/test-error');
  expect(res.status()).toBe(500);

  const errorEvent = await errorEventPromise;
  const values = errorEvent.exception?.values ?? [];

  // h3 wraps the thrown error in an HTTPError, so both are reported and linked.
  expect(values).toHaveLength(2);
  expect(values.some(v => v.type === 'Error' && v.value === 'This is a test error')).toBe(true);
  expect(
    values.some(v => v.mechanism?.type === 'auto.function.nitro.captureErrorHook' && v.mechanism.handled === false),
  ).toBe(true);
  expect(errorEvent.sdk?.name).toBe('sentry.javascript.cloudflare');
});

test('does not send 404 errors', async ({ request }) => {
  const errorEvents: (string | undefined)[] = [];
  const sentinelEventPromise = waitForError('nitro-3-cloudflare', event => {
    if (event.type) {
      return false;
    }
    errorEvents.push(event.exception?.values?.map(v => v.value).join(', '));
    return !!event.exception?.values?.some(v => v.value === 'This is a test error');
  });

  const notFoundRes = await request.get('/api/non-existent-route');
  expect(notFoundRes.status()).toBe(404);

  // The sentinel error arrives after anything the 404 could have sent, so waiting for it
  // makes the no-report assertion deterministic without a timeout.
  const sentinelRes = await request.get('/api/test-error');
  expect(sentinelRes.status()).toBe(500);

  await sentinelEventPromise;

  expect(errorEvents).toHaveLength(1);
});
