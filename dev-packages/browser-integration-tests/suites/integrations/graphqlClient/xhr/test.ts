import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

// Duplicate from subject.js
const query = `query Test{
  people {
    name
    pet
  }
}`;
const queryPayload = JSON.stringify({ query });

sentryTest('should update spans for GraphQL XHR requests', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    return;
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('**/foo', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        people: [
          { name: 'Amy', pet: 'dog' },
          { name: 'Jay', pet: 'cat' },
        ],
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const requestSpans = eventData.spans?.filter(({ op }) => op === 'http.client');

  expect(requestSpans).toHaveLength(1);

  expect(requestSpans![0]).toMatchObject({
    description: 'POST http://sentry-test.io/foo (query Test)',
    parent_span_id: eventData.contexts?.trace?.span_id,
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: eventData.contexts?.trace?.trace_id,
    status: 'ok',
    data: {
      type: 'xhr',
      'http.method': 'POST',
      'http.url': 'http://sentry-test.io/foo',
      url: 'http://sentry-test.io/foo',
      'server.address': 'sentry-test.io',
      'sentry.op': 'http.client',
      'sentry.origin': 'auto.http.browser',
      'graphql.document': queryPayload,
    },
  });
});

sentryTest('should update breadcrumbs for GraphQL XHR requests', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    return;
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('**/foo', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        people: [
          { name: 'Amy', pet: 'dog' },
          { name: 'Jay', pet: 'cat' },
        ],
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData?.breadcrumbs?.length).toBe(1);

  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'xhr',
    type: 'http',
    data: {
      method: 'POST',
      status_code: 200,
      url: 'http://sentry-test.io/foo',
      'graphql.document': query,
      'graphql.operation': 'query Test',
    },
  });
});
