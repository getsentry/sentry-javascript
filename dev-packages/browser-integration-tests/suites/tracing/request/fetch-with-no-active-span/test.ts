import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { envelopeUrlRegex, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'should not create span for fetch requests with no active span but should attach sentry-trace header',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    let requestCount = 0;
    const sentryTraceHeaders: string[] = [];
    page.on('request', request => {
      const url = request.url();

      const sentryTraceHeader = request.headers()['sentry-trace'];
      if (sentryTraceHeader) {
        sentryTraceHeaders.push(sentryTraceHeader);
      }
      expect(envelopeUrlRegex.test(url)).toBe(false);

      // We only want to count API requests
      if (
        envelopeUrlRegex.test(url) ||
        url.endsWith('.html') ||
        url.endsWith('.js') ||
        url.endsWith('.css') ||
        url.endsWith('.map')
      ) {
        return;
      }
      requestCount++;
    });

    await page.goto(url);

    expect(requestCount).toBe(3);

    expect(sentryTraceHeaders).toHaveLength(3);
    expect(sentryTraceHeaders).toEqual([
      expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})$/),
      expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})$/),
      expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})$/),
    ]);
  },
);
