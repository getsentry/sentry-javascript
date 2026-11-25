import { expect, test } from '@playwright/test';

test('initializes Sentry before the app plugins load', async ({ request }) => {
  const response = await request.get('/api/plugin-order');

  expect(await response.json()).toEqual({ initializedBeforePlugins: true });
});
