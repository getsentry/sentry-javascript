import { expect } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should update spans for GraphQL persisted query XHR requests', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
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

  const rootSpanPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
  const requestSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'http.client');
  await page.goto(url);
  const [rootSpan, requestSpan] = await Promise.all([rootSpanPromise, requestSpanPromise]);

  expect(requestSpan).toMatchObject({
    name: 'POST sentry-test.io',
    parent_span_id: rootSpan.span_id,
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    trace_id: rootSpan.trace_id,
    status: 'ok',
    attributes: expect.objectContaining({
      type: { type: 'string', value: 'xhr' },
      'http.request.method': { type: 'string', value: 'POST' },
      'url.full': { type: 'string', value: 'http://sentry-test.io/graphql' },
      'server.address': { type: 'string', value: 'sentry-test.io' },
      'sentry.op': { type: 'string', value: 'http.client' },
      'sentry.origin': { type: 'string', value: 'auto.http.browser' },
      'graphql.persisted_query.hash.sha256': {
        type: 'string',
        value: 'ecf4edb46db40b5132295c0291d62fb65d6759a9eedfa4d5d612dd5ec54a6b38',
      },
      'graphql.persisted_query.version': { type: 'integer', value: 1 },
    }),
  });
});

sentryTest('should update breadcrumbs for GraphQL persisted query XHR requests', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
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

  const rootSpanPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
  await page.goto(url);
  await rootSpanPromise;
  const eventPromise = waitForErrorRequest(page, event => event.message === 'GraphQL request completed');
  await page.evaluate(() => (window as any).Sentry.captureMessage('GraphQL request completed'));
  const eventData = envelopeRequestParser(await eventPromise);

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
