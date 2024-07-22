import { expect, test } from '@nuxt/test-utils/playwright';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('client-side errors', async () => {
  test('captures error thrown on click', async ({ page }) => {
    const errorPromise = waitForError('nuxt-3', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Error thrown from Nuxt-3 E2E test app';
    });

    await page.goto(`/client-error`);
    await page.locator('#errorBtn').click();

    const error = await errorPromise;

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Error thrown from Nuxt-3 E2E test app',
            mechanism: {
              handled: false,
            },
          },
        ],
      },
    });
    expect(error.transaction).toEqual('/client-error');
  });
});
