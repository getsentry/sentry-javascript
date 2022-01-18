import { expect } from '@playwright/test';
import { sentryTest } from '@utils/fixtures';
import { getSentryRequest } from '@utils/helpers';

sentryTest('should capture a simple error with message', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'test_simple_error',
    mechanism: {
      type: 'generic',
      handled: true,
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});
