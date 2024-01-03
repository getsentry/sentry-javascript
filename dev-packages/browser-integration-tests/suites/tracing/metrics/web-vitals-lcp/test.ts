import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should capture a LCP vital with element details.', async ({ browserName, getLocalTestPath, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('**/path/to/image.png', (route: Route) =>
    route.fulfill({ path: `${__dirname}/assets/sentry-logo-600x179.png` }),
  );

  const url = await getLocalTestPath({ testDir: __dirname });
  const [eventData] = await Promise.all([
    getFirstSentryEnvelopeRequest<Event>(page),
    page.goto(url),
    page.click('button'),
  ]);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.lcp?.value).toBeDefined();

  expect(eventData.tags?.['lcp.element']).toBe('body > img');
  expect(eventData.tags?.['lcp.size']).toBe(107400);
  expect(eventData.tags?.['lcp.url']).toBe('https://example.com/path/to/image.png');
});
