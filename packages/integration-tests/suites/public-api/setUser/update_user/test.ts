import { expect } from '@playwright/test';
import { sentryTest } from '@utils/fixtures';
import { getMultipleSentryRequests } from '@utils/helpers';

sentryTest('should update user', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getMultipleSentryRequests(page, 2, url);

  expect(eventData[0].message).toBe('first_user');
  expect(eventData[0].user).toMatchObject({
    id: 'foo',
    ip_address: 'bar',
  });

  expect(eventData[1].message).toBe('second_user');
  expect(eventData[1].user).toMatchObject({
    id: 'baz',
  });
});
