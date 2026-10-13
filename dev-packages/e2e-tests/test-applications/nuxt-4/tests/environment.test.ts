import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
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

  test('sets correct environment for client-side spans', async ({ page }) => {
    const pageloadSpanPromise = waitForStreamedSpan('nuxt-4', span => {
      return span.is_segment && span.name === '/test-param/:param()';
    });

    await page.goto(`/test-param/1234`);

    const pageloadSpan = await pageloadSpanPromise;

    if (isDevMode) {
      expect(pageloadSpan.attributes['sentry.environment']?.value).toBe('development');
    } else {
      expect(pageloadSpan.attributes['sentry.environment']?.value).toBe('production');
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

  test('sets correct environment for server-side spans', async ({ page }) => {
    const serverSpanPromise = waitForStreamedSpan('nuxt-4', span => {
      return span.is_segment && span.attributes['url.path']?.value === '/api/nitro-fetch';
    });

    await page.goto(`/fetch-server-routes`, isDevMode ? { waitUntil: 'networkidle' } : {});
    await page.getByText('Fetch Nitro $fetch', { exact: true }).click();

    const serverSpan = await serverSpanPromise;

    expect(getSpanOp(serverSpan)).toBe('http.server');

    if (isDevMode) {
      expect(serverSpan.attributes['sentry.environment']?.value).toBe('development');
    } else {
      expect(serverSpan.attributes['sentry.environment']?.value).toBe('production');
    }
  });
});
