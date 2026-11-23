import { expect, test } from '@playwright/test';

test.skip(process.env.TEST_ENV !== 'prod-nitro-import-hook', 'Only runs with `--import @sentry/nitro/import`');

test('`@sentry/nitro/import` sets up channel injection without `Sentry.init()`', async ({ request }) => {
  const response = await request.get('/api/test-import-hook');

  expect(await response.json()).toEqual({ runtimeInjection: true });
});
