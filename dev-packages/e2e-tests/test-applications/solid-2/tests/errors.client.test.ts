import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('client-side errors', () => {
  test('captures what an <Errored> boundary caught, without wrapping anything', async ({ page }) => {
    const errorEventPromise = waitForError('solid-2', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Error thrown from Solid 2 E2E test app client render';
    });

    await page.goto('/client-error');
    await expect(page.locator('#clientContent')).toHaveText('client content');
    await page.locator('#clientErrorBtn').click();
    await expect(page.locator('#clientErrorFallback')).toHaveText(/fallback: Error thrown/);

    const error = await errorEventPromise;
    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Error thrown from Solid 2 E2E test app client render',
            mechanism: { type: 'auto.function.solid.error_boundary', handled: true },
          },
        ],
      },
      tags: {
        'solid.owner': expect.stringContaining('<ClientBoundary>'),
        'solid.boundary': expect.stringContaining('<Errored>'),
      },
    });
  });
});
