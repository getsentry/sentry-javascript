import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Captures an error thrown while a page renders', async ({ request }) => {
  const errorPromise = waitForError('vinext-cf-workers', event => {
    return event.exception?.values?.[0]?.value === 'Page render error from vinext';
  });

  const response = await request.get('/page-error');
  expect(response.status()).toBe(500);

  const errorEvent = await errorPromise;

  expect(errorEvent.sdk?.name).toBe('sentry.javascript.nextjs');
  expect(errorEvent.environment).toBe('qa');
  expect(errorEvent.transaction).toBe('GET /page-error');
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.function.nextjs.on_request_error',
  });
});
