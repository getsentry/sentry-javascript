import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should add browser-related spans to pageload transaction', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const browserSpans = eventData.spans?.filter(({ op }) => op?.startsWith('browser'));

  // Spans `domContentLoadedEvent`, `connect`, `cache` and `DNS` are not
  // always inside `pageload` transaction.
  expect(browserSpans?.length).toBeGreaterThanOrEqual(4);

  ['loadEvent', 'request', 'response'].forEach(eventDesc =>
    expect(browserSpans).toContainEqual(
      expect.objectContaining({
        op: `browser.${eventDesc}`,
        description: page.url(),
        parent_span_id: eventData.contexts?.trace?.span_id,
      }),
    ),
  );
});
