import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should capture TTFB vital.', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  page.route('**', async route => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    route.continue();
  });
  page.route('**/path/to/image.png', async (route: Route) => {
    // Simulate a delay in the response to make sure we capture the TTFB vital.
    await new Promise(resolve => setTimeout(resolve, 1000));
    return route.fulfill({ path: `${__dirname}/assets/sentry-logo-600x179.png` });
  });

  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.ttfb?.value).toBeDefined();
  // ttfb should be greater than 0 because of the `page.route` delay. We don't want to test
  // the exact value here because it's not deterministic.
  expect(eventData.measurements?.ttfb?.value).toBeGreaterThan(0);

  expect(eventData.measurements?.['ttfb.requestTime']?.value).toBeDefined();
});
