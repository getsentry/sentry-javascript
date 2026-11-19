import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';
import { isVinext } from './isVinext';

test('should mark nextjs internal frames as not in_app for faulty click handlers', async ({ page }) => {
  test.skip(isDevMode || isVinext, 'Only relevant for production webpack builds');

  const errorPromise = waitForError('nextjs-16', async errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'click error';
  });

  await page.goto('/click-error');
  await page.click('#error-button');

  const errorEvent = await errorPromise;

  // Turbopack chunk names carry no hint about what they contain, so only webpack builds are checked.
  test.skip(!!errorEvent.tags?.turbopack, 'Only relevant for production webpack builds');

  const frames = errorEvent.exception?.values?.[0]?.stacktrace?.frames ?? [];

  const libChunkRegex = /^app:\/\/\/_next\/static\/chunks\/[0-9a-f]{8}[-.][0-9a-f]+\.js(:\d+)*$/;
  const libFrames = frames.filter(frame => frame.filename && libChunkRegex.test(frame.filename));

  expect(libFrames.length).toBeGreaterThan(0);
  expect(libFrames.filter(frame => frame.in_app !== false)).toEqual([]);

  expect(frames.at(-1)).toMatchObject({
    filename: expect.stringMatching(/^app:\/\/\/_next\/static\/chunks\/app\/click-error\/page-[0-9a-f]+\.js(:\d+)*$/),
    in_app: true,
  });
});
