import { expect } from '@playwright/test';
import { sentryTest } from '@utils/fixtures';
import { getSentryRequest } from '@utils/helpers';

sentryTest('should capture an undefined error when no arguments are provided', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'undefined',
    mechanism: {
      type: 'generic',
      handled: true,
    },
  });
});
