import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

const packageJson = require('../package.json');

test('Sends a client-side exception to Sentry', async ({ page }) => {
  const nextjsVersion = packageJson.dependencies.next;
  const nextjsMajor = Number(nextjsVersion.split('.')[0]);

  await page.goto('/');

  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
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
    // Next.js >= 15 propagates a trace ID to the client via a meta tag. Also, only dev mode emits a meta tag because
    // the requested page is static and only in dev mode SSR is kicked off.
    parent_span_id: nextjsMajor >= 15 && isDevMode ? expect.any(String) : undefined,
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });

  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: nextjsMajor >= 15 ? 'auto.browser.global_handlers.onerror' : 'auto.browser.browserapierrors.addEventListener',
    ...(nextjsMajor < 15 && {
      data: {
        handler: expect.any(String), // the handler name varies in CI and locally
        target: 'EventTarget',
      },
    }),
  });
});
