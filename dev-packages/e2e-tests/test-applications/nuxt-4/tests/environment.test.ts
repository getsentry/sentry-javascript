import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

test.describe('environment detection', async () => {
  test('sets correct environment for client-side errors', async ({ page }) => {
    const errorPromise = waitForError('nuxt-4', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Error thrown from Nuxt-4 E2E test app';
    });

    // We have to wait for networkidle in dev mode because clicking the button is a no-op otherwise (network requests are blocked during page load)
    await page.goto(`/client-error`, isDevMode ? { waitUntil: 'networkidle' } : {});
    await page.locator('#errorBtn').click();

    const error = await errorPromise;

    if (isDevMode) {
      expect(error.environment).toBe('development');
    } else {
      expect(error.environment).toBe('production');
    }
  });

  test('sets correct environment for client-side transactions', async ({ page }) => {
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

  test('sets correct environment for server-side errors', async ({ page }) => {
    const errorPromise = waitForError('nuxt-4', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Nuxt 4 Server error';
    });

    await page.goto(`/fetch-server-routes`, isDevMode ? { waitUntil: 'networkidle' } : {});
    await page.getByText('Fetch Server API Error', { exact: true }).click();

    const error = await errorPromise;

    expect(error.transaction).toBe('GET /api/server-error');

    if (isDevMode) {
      expect(error.environment).toBe('development');
    } else {
      expect(error.environment).toBe('production');
    }
  });

  test('sets correct environment for server-side transactions', async ({ page }) => {
    const transactionPromise = waitForTransaction('nuxt-4', async transactionEvent => {
      return transactionEvent.transaction === 'GET /api/nitro-fetch';
    });

    await page.goto(`/fetch-server-routes`, isDevMode ? { waitUntil: 'networkidle' } : {});
    await page.getByText('Fetch Nitro $fetch', { exact: true }).click();

    const transaction = await transactionPromise;

    expect(transaction.contexts.trace.op).toBe('http.server');

    if (isDevMode) {
      expect(transaction.environment).toBe('development');
    } else {
      expect(transaction.environment).toBe('production');
    }
  });
});
