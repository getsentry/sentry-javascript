import { test, expect } from '@playwright/test';
import { waitForError } from '../../../test-utils/event-proxy-server';

test.describe('dev mode error symbolification', () => {
  if (process.env.TEST_ENV !== 'development') {
    test.skip('should be skipped for non-dev mode', () => {});
    return;
  }

  test('should have symbolicated dev errors', async ({ page }) => {
    await page.goto('/client-component/parameter/42');

    const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Click Error';
    });

    await page.getByText('Throw error').click();

    const errorEvent = await errorEventPromise;
    const errorEventFrames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;

    expect(errorEventFrames?.[errorEventFrames?.length - 1]).toEqual(
      expect.objectContaining({
        filename: 'app/client-component/page.tsx',
        abs_path: 'webpack-internal:///(app-client)/./app/client-component/page.tsx',
        function: 'onClick',
        in_app: true,
        lineno: 10,
        colno: 16,
        pre_context: ['         id="exception-button"', '         onClick={() => {'],
        context_line: "           throw new Error('client-component-button-click-error');",
        post_context: ['         }}', '       >', '         throw'],
      }),
    );
  });
});
