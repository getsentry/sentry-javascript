import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should create fetch spans with http timing', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }
  await page.route('https://example.com/*', async route => {
    const request = route.request();
    const postData = await request.postDataJSON();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(Object.assign({ id: 1 }, postData)),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url, timeout: 10000 });
  const tracingEvent = envelopes[envelopes.length - 1]; // last envelope contains tracing data on all browsers

  const requestSpans = tracingEvent.spans?.filter(({ op }) => op === 'http.client');

  expect(requestSpans).toHaveLength(3);

  requestSpans?.forEach((span, index) =>
    expect(span).toMatchObject({
      description: `GET http://example.com/${index}`,
      parent_span_id: tracingEvent.contexts?.trace?.span_id,
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: tracingEvent.contexts?.trace?.trace_id,
      data: expect.objectContaining({
        'http.client.connectStart': expect.any(Number),
        'http.client.requestStart': expect.any(Number),
        'http.client.responseStart': expect.any(Number),
        'network.protocol.version': expect.any(String),
      }),
    }),
  );
});
