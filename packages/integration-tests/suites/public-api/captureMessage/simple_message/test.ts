import { expect } from '@playwright/test';
import { sentryTest } from '@utils/fixtures';
import { getSentryRequest } from '@utils/helpers';

sentryTest('should capture a simple message string', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  expect(eventData.message).toBe('foo');
  expect(eventData.level).toBe('info');
});
