import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('client-side errors', () => {
  test('captures error thrown on click', async ({ page }) => {
    const errorPromise = waitForError('solidstart', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Uncaught error thrown in UncaughtErrorPage route from Solid Start E2E test app';
    });

    await page.goto(`/uncaught-route-error`);
    const error = await errorPromise;

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Uncaught error thrown in UncaughtErrorPage route from Solid Start E2E test app',
            mechanism: {
              handled: false,
            },
          },
        ],
      },
      transaction: '/uncaught-route-error',
    });
    expect(error.transaction).toEqual('/uncaught-route-error');
  });
});
