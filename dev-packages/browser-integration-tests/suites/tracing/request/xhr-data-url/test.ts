import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('sanitizes data URLs in XHR span name and attributes', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const requestSpans = eventData.spans?.filter(({ op }) => op === 'http.client');

  expect(requestSpans).toHaveLength(1);

  const span = requestSpans?.[0];

  const sanitizedUrl = 'data:text/plain,base64,SGVsbG8gV2... [truncated]';
  expect(span?.description).toBe(`GET ${sanitizedUrl}`);

  expect(span?.data).toMatchObject({
    'http.method': 'GET',
    url: sanitizedUrl,
    type: 'xhr',
  });

  expect(span?.data?.['http.url']).toBe(sanitizedUrl);
});
