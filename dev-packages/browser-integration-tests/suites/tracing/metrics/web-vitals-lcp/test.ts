import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should capture a LCP vital with element details.', async ({ browserName, getLocalTestPath, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }
  page.route('**', route => route.continue());
  page.route('**/path/to/image.png', async (route: Route) => {
    return route.fulfill({ path: `${__dirname}/assets/sentry-logo-600x179.png` });
  });

  const url = await getLocalTestPath({ testDir: __dirname });
  const [eventData] = await Promise.all([
    getFirstSentryEnvelopeRequest<Event>(page),
    page.goto(url),
    // Clicking the button before image loads will result in the button being the LCP
    page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return images.every(img => img.complete);
    }),
  ]);

  console.log(eventData.contexts?.trace);
  expect(eventData.contexts?.trace?.data?.['lcp.element']).toBe('body > img');
  await page.locator('button').click();

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.lcp?.value).toBeDefined();

  expect(eventData.contexts?.trace?.data?.['lcp.element']).toBe('body > img');
  expect(eventData.contexts?.trace?.data?.['lcp.size']).toBe(107400);
  expect(eventData.contexts?.trace?.data?.['lcp.url']).toBe('https://example.com/path/to/image.png');
});
