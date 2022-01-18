import { expect } from '@playwright/test';
import { sentryTest } from '@utils/fixtures';
import { getSentryRequest } from '@utils/helpers';

sentryTest('should add a simple breadcrumb', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  expect(eventData.breadcrumbs).toHaveLength(1);
  expect(eventData.breadcrumbs?.[0]).toMatchObject({
    category: 'foo',
    message: 'bar',
    level: 'baz',
  });
  expect(eventData.message).toBe('test');
});
