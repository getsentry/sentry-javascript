import { test, expect } from '@playwright/test';
import { waitForError } from '../../../test-utils/event-proxy-server';

test.describe('dev mode error symbolification', () => {
  if (process.env.TEST_ENV !== 'development') {
    test.skip('should be skipped for non-dev mode', () => {});
    return;
  }

  test('should have symbolicated dev errors', async ({ page }) => {
    await page.goto('/');

    const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Click Error';
    });

    await page.getByText('Throw error').click();

    const errorEvent = await errorEventPromise;
    const errorEventFrames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;

    expect(errorEventFrames?.[errorEventFrames?.length - 1]).toEqual(
      expect.objectContaining({
        filename: 'components/client-error-debug-tools.tsx',
        abs_path: 'webpack-internal:///(app-client)/./components/client-error-debug-tools.tsx',
        function: 'onClick',
        in_app: true,
        lineno: 32,
        colno: 16,
        post_context: ['         }}', '       >', '         Throw error'],
        context_line: "           throw new Error('Click Error');",
        pre_context: ['       <button', '         onClick={() => {'],
      }),
    );
  });
});
