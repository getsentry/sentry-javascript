import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('should mark nextjs internal frames as not in_app for faulty click handlers', async ({ page }) => {
  // The internal-chunk detection matches webpack chunk names (e.g. `webpack-<hash>.js`), which only exist in
  // production webpack builds. Turbopack and dev builds emit differently-named chunks, so this is only relevant there.
  test.skip(process.env.TEST_ENV !== 'production', 'Only relevant for production webpack builds');

  const errorPromise = waitForError('nextjs-15', async errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'click error';
  });

  await page.goto('/42/click-error');
  await page.click('#error-button');

  const errorEvent = await errorPromise;

  expect(errorEvent).toBeDefined();

  const frames = errorEvent?.exception?.values?.[0]?.stacktrace?.frames;

  const internalChunkRegex =
    /^app:\/\/\/_next\/static\/chunks\/(main-|main-app-|polyfills-|webpack-|framework-|framework\.)[0-9a-f]+\.js(:\d+)*$/;

  const internalFrames = frames?.filter(frame => frame.filename && internalChunkRegex.test(frame.filename)) ?? [];

  expect(internalFrames.length).toBeGreaterThan(0);
  expect(internalFrames.filter(frame => frame.in_app !== false)).toEqual([]);
});
