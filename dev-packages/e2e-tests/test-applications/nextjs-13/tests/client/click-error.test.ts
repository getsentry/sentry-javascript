import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('should send error for faulty click handlers', async ({ page }) => {
  const errorPromise = waitForError('nextjs-13', async errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'click error';
  });

  await page.goto('/42/click-error');
  await page.click('#error-button');

  const errorEvent = await errorPromise;

  expect(errorEvent).toBeDefined();

  const exception = errorEvent?.exception?.values?.[0];

  expect(exception?.mechanism).toEqual({
    type: 'auto.browser.browserapierrors.addEventListener',
    handled: false,
    data: {
      handler: expect.any(String), // the handler name varies in CI and locally
      target: 'EventTarget',
    },
  });

  const frames = exception?.stacktrace?.frames;
  await test.step('error should have a non-url-encoded top frame in route with parameter', () => {
    if (process.env.TEST_ENV === 'development') {
      // In dev mode we want to check local source mapping
      expect(frames?.[frames.length - 1].filename).toMatch(/\/\[param\]\/click-error.tsx$/);
    } else {
      expect(frames?.[frames.length - 1].filename).toMatch(/\/\[param\]\/click-error-[a-f0-9]+\.js$/);
    }
  });

  await test.step('error should have `in_app`: false for nextjs internal frames', () => {
    if (process.env.TEST_ENV !== 'development') {
      expect(frames).toContainEqual(
        expect.objectContaining({
          filename: expect.stringMatching(
            /^app:\/\/\/_next\/static\/chunks\/(main-|main-app-|polyfills-|webpack-|framework-|framework\.)[0-9a-f]+\.js$/,
          ),
          in_app: false,
        }),
      );

      expect(frames).not.toContainEqual(
        expect.objectContaining({
          filename: expect.stringMatching(
            /^app:\/\/\/_next\/static\/chunks\/(main-|main-app-|polyfills-|webpack-|framework-|framework\.)[0-9a-f]+\.js$/,
          ),
          in_app: true,
        }),
      );
    }
  });
});
