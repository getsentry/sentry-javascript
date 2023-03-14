import type { Request } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest('should create spans for multiple fetch requests', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  // Because we fetch from http://example.com, fetch will throw a CORS error in firefox and webkit.
  // Chromium does not throw for cors errors.
  // This means that we will intercept a dynamic amount of envelopes here.

  // We will wait 500ms for all envelopes to be sent. Generally, in all browsers, the last sent
  // envelope contains tracing data.

  // If we are on FF or webkit:
  // 1st envelope contains CORS error
  // 2nd envelope contains the tracing data we want to check here
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
    }),
  );
});

sentryTest('should attach `sentry-trace` header to multiple fetch requests', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const requests = (
    await Promise.all([
      page.goto(url),
      Promise.all([0, 1, 2].map(idx => page.waitForRequest(`http://example.com/${idx}`))),
    ])
  )[1];

  expect(requests).toHaveLength(3);

  requests?.forEach(async (request: Request) => {
    const requestHeaders = await request.allHeaders();
    expect(requestHeaders).toMatchObject({
      'sentry-trace': expect.any(String),
    });
  });
});
