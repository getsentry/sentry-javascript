import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

// This tests asserts that the pageload span will finish itself after the child span timeout if it
// has a child span without adding any additional ones or finishing any of them finishing. All of the child spans that
// are still running should have the status "cancelled".
sentryTest('should send a pageload span terminated via child span timeout', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.contexts?.trace?.op).toBe('pageload');
  expect(eventData.spans?.length).toBeGreaterThanOrEqual(1);
  const testSpan = eventData.spans?.find(span => span.description === 'pageload-child-span');
  expect(testSpan).toBeDefined();
  expect(testSpan?.status).toBe('cancelled');
});
