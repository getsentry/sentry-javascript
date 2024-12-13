import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('server-side errors', async () => {
  test('captures api fetch error (fetched on click)', async ({ page }) => {
    const errorPromise = waitForError('nuxt-3', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Nuxt 3 Server error';
    });

    await page.goto(`/fetch-server-error`);
    await page.getByText('Fetch Server Data', { exact: true }).click();

    const error = await errorPromise;

    expect(error.transaction).toEqual('GET /api/server-error');

    const exception = error.exception.values[0];
    expect(exception.type).toEqual('Error');
    expect(exception.value).toEqual('Nuxt 3 Server error');
    expect(exception.mechanism.handled).toBe(false);
  });

  test('captures api fetch error (fetched on click) with parametrized route', async ({ page }) => {
    const errorPromise = waitForError('nuxt-3', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Nuxt 3 Param Server error';
    });

    await page.goto(`/test-param/1234`);
    await page.getByRole('button', { name: 'Fetch Server Error', exact: true }).click();

    const error = await errorPromise;

    expect(error.transaction).toEqual('GET /api/param-error/1234');

    const exception = error.exception.values[0];
    expect(exception.type).toEqual('Error');
    expect(exception.value).toEqual('Nuxt 3 Param Server error');
    expect(exception.mechanism.handled).toBe(false);
  });
});
