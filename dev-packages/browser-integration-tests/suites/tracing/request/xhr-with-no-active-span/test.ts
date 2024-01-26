import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'there should be no span created for xhr requests with no active span',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    let requestCount = 0;
    page.on('request', request => {
      expect(request.url()).not.toContain(url);
      requestCount++;
    });

    await page.goto(url);

    // There are 6 requests in the page:
    // 1. HTML page
    // 2. Init JS bundle
    // 3. Subject JS bundle
    // and then 3 fetch requests
    expect(requestCount).toBe(6);
  },
);
