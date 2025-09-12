import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('server-side errors', async () => {
  test('captures api fetch error (fetched on click)', async ({ page }) => {
    const errorPromise = waitForError('nuxt-3-min', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Nuxt 3 Server error';
    });

    await page.goto(`/fetch-server-error`);
    await page.getByText('Fetch Server API Error', { exact: true }).click();

    const error = await errorPromise;

    expect(error.transaction).toEqual('GET /api/server-error');

    const exception0 = error.exception.values[0];
    const exception1 = error.exception.values[1];

    expect(exception0.type).toEqual('Error');
    expect(exception0.value).toEqual('Nuxt 3 Server error');
    expect(exception0.mechanism).toEqual({
      handled: false,
      type: 'auto.function.nuxt.nitro',
      exception_id: 1,
      parent_id: 0,
      source: 'cause',
    });

    // TODO: This isn't correct but requires adjustment in the core SDK
    expect(exception1.type).toEqual('Error');
    expect(exception1.value).toEqual('Nuxt 3 Server error');
    expect(exception1.mechanism).toEqual({ handled: true, type: 'generic', exception_id: 0 });
  });

  test('captures api fetch error (fetched on click) with parametrized route', async ({ page }) => {
    const errorPromise = waitForError('nuxt-3-min', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Nuxt 3 Param Server error';
    });

    await page.goto(`/test-param/1234`);
    await page.getByRole('button', { name: 'Fetch Server API Error', exact: true }).click();

    const error = await errorPromise;

    expect(error.transaction).toEqual('GET /api/param-error/1234');

    const exception0 = error.exception.values[0];
    const exception1 = error.exception.values[1];

    expect(exception0.type).toEqual('Error');
    expect(exception0.value).toEqual('Nuxt 3 Param Server error');
    expect(exception0.mechanism).toEqual({
      handled: false,
      type: 'auto.function.nuxt.nitro',
      exception_id: 1,
      parent_id: 0,
      source: 'cause',
    });

    // TODO: This isn't correct but requires adjustment in the core SDK
    expect(exception1.type).toEqual('Error');
    expect(exception1.value).toEqual('Nuxt 3 Param Server error');
    expect(exception1.mechanism).toEqual({ handled: true, type: 'generic', exception_id: 0 });
  });
});
