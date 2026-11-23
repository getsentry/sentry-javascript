import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

test('should have symbolicated dev errors', async ({ page }) => {
  test.skip(!isDevMode, 'should be skipped for non-dev mode');

  await page.goto('/click-error');

  const errorEventPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'click error';
  });

  await page.click('#error-button');

  const errorEvent = await errorEventPromise;
  const errorEventFrames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;

  expect(errorEventFrames?.[errorEventFrames?.length - 1]).toEqual(
    expect.objectContaining({
      function: 'onClick',
      filename: 'app/click-error/page.tsx',
      lineno: 8,
      colno: expect.any(Number),
      in_app: true,
      pre_context: ['       id="error-button"', '       onClick={() => {'],
      context_line: "         throw new Error('click error');",
      post_context: ['       }}', '     >', '       click to throw error'],
    }),
  );
});
