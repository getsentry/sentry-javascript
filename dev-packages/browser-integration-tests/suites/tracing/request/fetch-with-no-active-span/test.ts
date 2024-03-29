import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { envelopeUrlRegex, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'there should be no span created for fetch requests with no active span',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    let requestCount = 0;
    page.on('request', request => {
      expect(envelopeUrlRegex.test(request.url())).toBe(false);
      requestCount++;
    });

    await page.goto(url);

    // Here are the requests that should exist:
    // 1. HTML page
    // 2. Init JS bundle
    // 3. Subject JS bundle
    // 4 [OPTIONAl] CDN JS bundle
    // and then 3 fetch requests
    if (process.env.PW_BUNDLE && process.env.PW_BUNDLE.startsWith('bundle_')) {
      expect(requestCount).toBe(7);
    } else {
      expect(requestCount).toBe(6);
    }
  },
);
