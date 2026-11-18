import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

test('Sends a client-side exception to Sentry', async ({ page }) => {
  await page.goto('/');

  const errorEventPromise = waitForError('nextjs-14', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Click Error';
  });

  await page.getByText('Throw error').click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Click Error');

  expect(errorEvent.request).toEqual({
    headers: expect.any(Object),
    url: 'http://localhost:3030/',
  });

  expect(errorEvent.transaction).toEqual('/');

  expect(errorEvent.contexts?.trace).toEqual({
    // The server sends the trace in a `Server-Timing` header, except with a document a shared cache may store. In
    // production the requested page is static, so only dev mode, which renders it per request, connects the pageload.
    parent_span_id: isDevMode ? expect.any(String) : undefined,
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });

  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.browser.browserapierrors.addEventListener',
    data: {
      handler: expect.any(String), // the handler name varies in CI and locally
      target: 'EventTarget',
    },
  });
});
