import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { waitForInitialPageload } from './utils';

test.describe('client-side errors', () => {
  test('captures error thrown on click', async ({ page }) => {
    await waitForInitialPageload(page, { route: '/client-error' });

    const errorEventPromise = waitForError('sveltekit-2', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Click Error';
    });

    await page.getByText('Throw error').click();

    await expect(errorEventPromise).resolves.toBeDefined();

    const errorEvent = await errorEventPromise;

    const errorEventFrames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;

    expect(errorEventFrames?.[errorEventFrames?.length - 1]).toEqual(
      expect.objectContaining({
        function: expect.stringContaining('HTMLButtonElement'),
        lineno: 1,
        in_app: true,
      }),
    );

    expect(errorEvent.transaction).toEqual('/client-error');
  });

  test('captures universal load error', async ({ page }) => {
    await waitForInitialPageload(page);
    await page.reload();

    const errorEventPromise = waitForError('sveltekit-2', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Universal Load Error (browser)';
    });

    // navigating triggers the error on the client
    await page.getByText('Universal Load error').click();

    const errorEvent = await errorEventPromise;
    const errorEventFrames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;

    const lastFrame = errorEventFrames?.[errorEventFrames?.length - 1];
    expect(lastFrame).toEqual(
      expect.objectContaining({
        lineno: 1,
        in_app: true,
      }),
    );

    expect(errorEvent.transaction).toEqual('/universal-load-error');
  });
});
