import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

test.describe('environment detection', async () => {
  test('sets correct environment for application errors', async ({ page }) => {
    const errorPromise = waitForError('nuxt-4', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Error thrown from Nuxt-4 E2E test app';
    });

    await page.goto(`/client-error`);
    await page.locator('#errorBtn').click();

    const error = await errorPromise;

    if (isDevMode) {
      expect(error.environment).toBe('development');
    } else {
      expect(error.environment).toBe('production');
    }
  });

  test('sets correct environment for application transactions', async ({ page }) => {
    const transactionPromise = waitForTransaction('nuxt-4', async transactionEvent => {
      return transactionEvent.transaction === '/test-param/:param()';
    });

    await page.goto(`/test-param/1234`);

    const transaction = await transactionPromise;

    if (isDevMode) {
      expect(transaction.environment).toBe('development');
    } else {
      expect(transaction.environment).toBe('production');
    }
  });

  test('includes environment in event context', async ({ page }) => {
    const errorPromise = waitForError('nuxt-4', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Error thrown from Nuxt-4 E2E test app';
    });

    await page.goto(`/client-error`);
    await page.locator('#errorBtn').click();

    const error = await errorPromise;

    if (isDevMode) {
      expect(error.environment).toBe('development');
    } else {
      expect(error.environment).toBe('production');
    }
  });
});
