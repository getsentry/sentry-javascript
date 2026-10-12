import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { IMPORT_SURFACES } from './importSurfaces';

IMPORT_SURFACES.forEach(({ name, apiPrefix }) => {
  test.describe(`server-side errors (${name})`, () => {
    test('captures api fetch error (fetched on click)', async ({ page }) => {
      const errorPromise = waitForError('nuxt-5', async errorEvent => {
        return errorEvent?.exception?.values?.[0]?.value === 'Nuxt 5 Server error';
      });

      await page.goto(`/fetch-server-routes?apiPrefix=${apiPrefix}`);
      await page.getByText('Fetch Server API Error', { exact: true }).click();

      const error = await errorPromise;

      expect(error.transaction).toEqual(`GET ${apiPrefix}/server-error`);

      const exception0 = error.exception.values[0];
      const exception1 = error.exception.values[1];

      expect(exception0.type).toEqual('Error');
      expect(exception0.value).toEqual('Nuxt 5 Server error');
      expect(exception0.mechanism).toEqual({
        handled: true,
        type: 'chained',
        exception_id: 1,
        parent_id: 0,
        source: 'cause',
      });

      expect(exception1.type).toEqual('HTTPError');
      expect(exception1.value).toEqual('Nuxt 5 Server error');
      expect(exception1.mechanism).toEqual({
        handled: false,
        type: 'auto.function.nuxt.nitro',
        exception_id: 0,
      });
    });

    test('captures api fetch error (fetched on click) with parametrized route', async ({ page }) => {
      const errorPromise = waitForError('nuxt-5', async errorEvent => {
        return errorEvent?.exception?.values?.[0]?.value === 'Nuxt 5 Param Server error';
      });

      await page.goto(`/test-param/1234?apiPrefix=${apiPrefix}`);
      await page.getByRole('button', { name: 'Fetch Server API Error', exact: true }).click();

      const error = await errorPromise;

      expect(error.transaction).toEqual(`GET ${apiPrefix}/param-error/1234`);

      const exception0 = error.exception.values[0];
      const exception1 = error.exception.values[1];

      expect(exception0.type).toEqual('Error');
      expect(exception0.value).toEqual('Nuxt 5 Param Server error');
      expect(exception0.mechanism).toEqual({
        handled: true,
        type: 'chained',
        exception_id: 1,
        parent_id: 0,
        source: 'cause',
      });

      expect(exception1.type).toEqual('HTTPError');
      expect(exception1.value).toEqual('Nuxt 5 Param Server error');
      expect(exception1.mechanism).toEqual({
        handled: false,
        type: 'auto.function.nuxt.nitro',
        exception_id: 0,
      });
    });

    // ky and got name their errors `HTTPError` too. h3 wraps a thrown one in its own error before the
    // hook sees it, so this checks it still gets reported. The hook's handling of an unwrapped lookalike
    // is covered by the unit tests.
    test('captures a thrown third-party `HTTPError`', async ({ page }) => {
      const errorPromise = waitForError('nuxt-5', async errorEvent => {
        return !!errorEvent?.exception?.values?.some(value => value.value === 'Nuxt 5 third-party HTTPError');
      });

      await page.goto(`/fetch-server-routes?apiPrefix=${apiPrefix}`);
      await page.getByText('Fetch Third-Party HTTPError', { exact: true }).click();

      const error = await errorPromise;

      expect(error.transaction).toEqual(`GET ${apiPrefix}/third-party-http-error`);
      expect(error.exception.values).toHaveLength(2);

      const [thirdPartyError, h3Error] = error.exception.values;

      expect(thirdPartyError.type).toEqual('HTTPError');
      expect(thirdPartyError.value).toEqual('Nuxt 5 third-party HTTPError');
      expect(thirdPartyError.mechanism).toEqual({
        handled: true,
        type: 'chained',
        exception_id: 1,
        parent_id: 0,
        source: 'cause',
      });

      expect(h3Error.type).toEqual('HTTPError');
      expect(h3Error.value).toEqual('Nuxt 5 third-party HTTPError');
      expect(h3Error.mechanism).toEqual({
        handled: false,
        type: 'auto.function.nuxt.nitro',
        exception_id: 0,
      });
    });
  });
});
