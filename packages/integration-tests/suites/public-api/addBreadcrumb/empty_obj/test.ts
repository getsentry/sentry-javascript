import { expect } from '@playwright/test';
import { sentryTest } from '@utils/fixtures';
import { getSentryRequest } from '@utils/helpers';

sentryTest(
  'should add an empty breadcrumb initialized with a timestamp, when an empty object is given',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const eventData = await getSentryRequest(page, url);

    expect(eventData.breadcrumbs).toHaveLength(1);
    expect(eventData.breadcrumbs?.[0]).toMatchObject({
      timestamp: expect.any(Number),
    });

    expect(eventData.message).toBe('test_empty_obj');
  },
);
