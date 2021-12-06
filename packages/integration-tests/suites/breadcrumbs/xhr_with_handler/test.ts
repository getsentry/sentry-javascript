import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getSentryRequest } from '../../../utils/helpers';

sentryTest('should record an XMLHttpRequest with a handler', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  expect(eventData.message).toBe('test');
  expect(eventData.breadcrumbs).toHaveLength(1);
  expect(eventData.breadcrumbs?.[0].category).toBe('xhr');
  expect(eventData.breadcrumbs?.[0].type).toBe('http');
  expect(eventData.breadcrumbs?.[0].data?.method).toBe('GET');
  expect(eventData.breadcrumbs?.[0].data?.url).toBe('/base/subjects/example.json');
});
