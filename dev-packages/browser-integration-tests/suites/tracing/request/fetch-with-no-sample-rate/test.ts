import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { envelopeUrlRegex, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'should not create span for fetch requests with no active span but should attach sentry-trace header if no sample rate is set',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    let requestCount = 0;
    const sentryTraceHeaders: string[] = [];
    page.on('request', request => {
      const sentryTraceHeader = request.headers()['sentry-trace'];
      if (sentryTraceHeader) {
        sentryTraceHeaders.push(sentryTraceHeader);
      }
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

    // TODO: This is incorrect behavior. Even if `tracesSampleRate` is not set (which in browser
    // realistically is the only way to truly get "Tracing without performance"), we should still
    // attach the `sentry-trace` header to the fetch requests.
    // Right now, we don't do this, as this test demonstrates.
    expect(sentryTraceHeaders).toHaveLength(0);
  },
);
