import { test } from '@playwright/test';
import { waitForError } from '../../../test-utils/event-proxy-server';
import { BUTTON_CLICK_ERROR_MESSAGE } from '../app/client-component/page';

test.describe('dev mode error symbolification', () => {
  if (process.env.TEST_ENV !== 'development') {
    test.skip('should be skipped for non-dev mode', () => {});
    return;
  }

  test('should have symbaolicated dev errors', async ({ page }) => {
    await page.goto('/client-component');

    const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === BUTTON_CLICK_ERROR_MESSAGE;
    });

    const exceptionButton = page.locator('id=exception-button');
    await exceptionButton.click();

    const errorEvent = await errorEventPromise;
    console.log(JSON.stringify(errorEvent));
  });
});
