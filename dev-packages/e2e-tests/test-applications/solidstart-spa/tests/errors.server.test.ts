import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('server-side errors', () => {
  test('captures server action error', async ({ page }) => {
    const errorEventPromise = waitForError('solidstart-spa', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Error thrown from Solid Start E2E test app server route';
    });

    await page.goto(`/server-error`);

    const error = await errorEventPromise;

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Error thrown from Solid Start E2E test app server route',
            mechanism: {
              type: 'solidstart',
              handled: false,
            },
          },
        ],
      },
    });
  });
});
