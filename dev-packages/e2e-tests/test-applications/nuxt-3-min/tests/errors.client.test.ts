import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('client-side errors', async () => {
  test('captures error thrown on click', async ({ page }) => {
    const errorPromise = waitForError('nuxt-3-min', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Error thrown from Nuxt-3-min E2E test app';
    });

    await page.goto(`/client-error`);
    await page.locator('#errorBtn').click();

    const error = await errorPromise;

    expect(error.transaction).toEqual('/client-error');
    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Error thrown from Nuxt-3-min E2E test app',
            mechanism: {
              handled: false,
              type: 'auto.function.nuxt.vue-error',
            },
          },
        ],
      },
    });
  });

  test('shows parametrized route on button error', async ({ page }) => {
    const errorPromise = waitForError('nuxt-3-min', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Error thrown from Param Route Button';
    });

    await page.goto(`/test-param/1234`);
    await page.locator('#errorBtn').click();

    const error = await errorPromise;

    expect(error.sdk.name).toEqual('sentry.javascript.nuxt');
    expect(error.transaction).toEqual('/test-param/:param()');
    expect(error.request.url).toMatch(/\/test-param\/1234/);
    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Error thrown from Param Route Button',
            mechanism: {
              handled: false,
              type: 'auto.function.nuxt.vue-error',
            },
          },
        ],
      },
    });
  });

  test('page is still interactive after client error', async ({ page }) => {
    const error1Promise = waitForError('nuxt-3-min', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Error thrown from Nuxt-3-min E2E test app';
    });

    await page.goto(`/client-error`);
    await page.locator('#errorBtn').click();

    const error1 = await error1Promise;

    const error2Promise = waitForError('nuxt-3-min', async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Another Error thrown from Nuxt-3-min E2E test app';
    });

    await page.locator('#errorBtn2').click();

    const error2 = await error2Promise;

    expect(error1).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Error thrown from Nuxt-3-min E2E test app',
            mechanism: {
              handled: false,
              type: 'auto.function.nuxt.vue-error',
            },
          },
        ],
      },
    });

    expect(error2).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Another Error thrown from Nuxt-3-min E2E test app',
            mechanism: {
              handled: false,
              type: 'auto.function.nuxt.vue-error',
            },
          },
        ],
      },
    });
  });
});
