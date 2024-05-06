import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'instrumentation should pass on headers from fetch options instead of init request, if set',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    await page.route('**/api/test/', async route => {
      const req = route.request();
      const headers = await req.allHeaders();

      // headers.bar was set in fetch options (and should be sent)
      expect(headers.bar).toBe('22');
      // headers.foo was set in init request object (and should be ignored)
      expect(headers.foo).toBeUndefined();

      return route.fulfill({
        status: 200,
        body: 'ok',
      });
    });

    await getLocalTestUrl({ testDir: __dirname });
  },
);
