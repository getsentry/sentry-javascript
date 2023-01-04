import type { Request } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should create spans for multiple XHR requests', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const requestSpans = eventData.spans?.filter(({ op }) => op === 'http.client');

  expect(requestSpans).toHaveLength(3);

  requestSpans?.forEach((span, index) =>
    expect(span).toMatchObject({
      description: `GET http://example.com/${index}`,
      parent_span_id: eventData.contexts?.trace?.span_id,
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: eventData.contexts?.trace?.trace_id,
    }),
  );
});

sentryTest('should attach `sentry-trace` header to multiple XHR requests', async ({ getLocalTestPath, page }) => {
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
