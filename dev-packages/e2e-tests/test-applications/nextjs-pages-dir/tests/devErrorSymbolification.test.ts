import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('should have symbolicated dev errors', async ({ page }) => {
  test.skip(!process.env.TEST_ENV?.includes('development'), 'should be skipped for non-dev mode');

  await page.goto('/');

  const errorEventPromise = waitForError('nextjs-pages-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Click Error';
  });

  await page.getByText('Throw error').click();

  const errorEvent = await errorEventPromise;
  const errorEventFrames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;

  expect(errorEventFrames?.[errorEventFrames?.length - 1]).toEqual(
    expect.objectContaining({
      function: 'onClick',
      filename: 'components/client-error-debug-tools.tsx',
      lineno: 54,
      colno: expect.any(Number),
      in_app: true,
      pre_context: ['       <button', '         onClick={() => {'],
      context_line: "           throw new Error('Click Error');",
      post_context: ['         }}', '       >', '         Throw error'],
    }),
  );
});
