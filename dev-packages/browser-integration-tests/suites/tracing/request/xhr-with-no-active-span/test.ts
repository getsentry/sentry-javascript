import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'should not create span for xhr requests with no active span but should attach sentry-trace header',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const sentryTraceHeaders: string[] = [];

    await page.route('http://example.com/**', route => {
      const sentryTraceHeader = route.request().headers()['sentry-trace'];
      if (sentryTraceHeader) {
        sentryTraceHeaders.push(sentryTraceHeader);
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    const url = await getLocalTestUrl({ testDir: __dirname });

    await Promise.all([page.goto(url), ...[0, 1, 2].map(idx => page.waitForRequest(`http://example.com/${idx}`))]);

    expect(await page.evaluate('window._sentryTransactionsCount')).toBe(0);

    expect(sentryTraceHeaders).toHaveLength(3);
    expect(sentryTraceHeaders).toEqual([
      expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})$/),
      expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})$/),
      expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})$/),
    ]);
  },
);
