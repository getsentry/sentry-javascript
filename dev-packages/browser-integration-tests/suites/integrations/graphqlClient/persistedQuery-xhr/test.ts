import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should update spans for GraphQL persisted query XHR requests', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    return;
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('**/graphql', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        data: {
          user: {
            id: '123',
            name: 'Test User',
          },
        },
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
    description: 'POST http://sentry-test.io/graphql (persisted GetUser)',
    parent_span_id: eventData.contexts?.trace?.span_id,
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: eventData.contexts?.trace?.trace_id,
    status: 'ok',
    data: {
      type: 'xhr',
      'http.method': 'POST',
      'http.url': 'http://sentry-test.io/graphql',
      url: 'http://sentry-test.io/graphql',
      'server.address': 'sentry-test.io',
      'sentry.op': 'http.client',
      'sentry.origin': 'auto.http.browser',
      'graphql.persisted_query.hash.sha256': 'ecf4edb46db40b5132295c0291d62fb65d6759a9eedfa4d5d612dd5ec54a6b38',
      'graphql.persisted_query.version': 1,
    },
  });
});

sentryTest('should update breadcrumbs for GraphQL persisted query XHR requests', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    return;
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('**/graphql', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        data: {
          user: {
            id: '123',
            name: 'Test User',
          },
        },
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData?.breadcrumbs?.length).toBe(1);

  expect(eventData.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'xhr',
    type: 'http',
    data: {
      method: 'POST',
      status_code: 200,
      url: 'http://sentry-test.io/graphql',
      'graphql.operation': 'persisted GetUser',
      'graphql.persisted_query.hash.sha256': 'ecf4edb46db40b5132295c0291d62fb65d6759a9eedfa4d5d612dd5ec54a6b38',
      'graphql.persisted_query.version': 1,
    },
  });
});
