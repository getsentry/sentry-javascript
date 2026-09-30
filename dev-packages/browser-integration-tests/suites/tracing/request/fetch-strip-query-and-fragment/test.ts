import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('strips query params in fetch request spans', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const rootPromise = waitForStreamedSpan(page, span => span.is_segment && span.name === 'rootSpan');
  const requestPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'http.client');
  await page.locator('#btnQuery').click();
  const [rootSpan, requestSpan] = await Promise.all([rootPromise, requestPromise]);

  expect(rootSpan.name).toBe('rootSpan');

  expect(requestSpan).toMatchObject({
    name: 'GET sentry-test-site.example',
    parent_span_id: rootSpan.span_id,
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    trace_id: rootSpan.trace_id,
    attributes: expect.objectContaining({
      'http.request.method': { type: 'string', value: 'GET' },
      'url.full': { type: 'string', value: 'http://sentry-test-site.example/0?id=123;page=5' },
      'url.query': { type: 'string', value: 'id=123;page=5' },
      'http.response.status_code': { type: 'integer', value: 200 },
      'http.response.body.size': { type: 'integer', value: 2 },
      'sentry.op': { type: 'string', value: 'http.client' },
      'sentry.origin': { type: 'string', value: 'auto.http.browser' },
      type: { type: 'string', value: 'fetch' },
      'server.address': { type: 'string', value: 'sentry-test-site.example' },
    }),
  });

  expect(requestSpan?.attributes).not.toHaveProperty('url.fragment');
});

sentryTest('strips hash fragment in fetch request spans', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const rootPromise = waitForStreamedSpan(page, span => span.is_segment && span.name === 'rootSpan');
  const requestPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'http.client');
  await page.locator('#btnFragment').click();
  const [rootSpan, requestSpan] = await Promise.all([rootPromise, requestPromise]);

  expect(rootSpan.name).toBe('rootSpan');

  expect(requestSpan).toMatchObject({
    name: 'GET sentry-test-site.example',
    parent_span_id: rootSpan.span_id,
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    trace_id: rootSpan.trace_id,
    attributes: expect.objectContaining({
      'http.request.method': { type: 'string', value: 'GET' },
      'url.full': { type: 'string', value: 'http://sentry-test-site.example/1#fragment' },
      'url.fragment': { type: 'string', value: 'fragment' },
      'http.response.status_code': { type: 'integer', value: 200 },
      'http.response.body.size': { type: 'integer', value: 2 },
      'sentry.op': { type: 'string', value: 'http.client' },
      'sentry.origin': { type: 'string', value: 'auto.http.browser' },
      type: { type: 'string', value: 'fetch' },
      'server.address': { type: 'string', value: 'sentry-test-site.example' },
    }),
  });

  expect(requestSpan?.attributes).not.toHaveProperty('url.query');
});

sentryTest('strips hash fragment and query params in fetch request spans', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const rootPromise = waitForStreamedSpan(page, span => span.is_segment && span.name === 'rootSpan');
  const requestPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'http.client');
  await page.locator('#btnQueryFragment').click();
  const [rootSpan, requestSpan] = await Promise.all([rootPromise, requestPromise]);

  expect(rootSpan.name).toBe('rootSpan');

  expect(requestSpan).toMatchObject({
    name: 'GET sentry-test-site.example',
    parent_span_id: rootSpan.span_id,
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    trace_id: rootSpan.trace_id,
    attributes: expect.objectContaining({
      'http.request.method': { type: 'string', value: 'GET' },
      'url.full': { type: 'string', value: 'http://sentry-test-site.example/2?id=1#fragment' },
      'url.query': { type: 'string', value: 'id=1' },
      'url.fragment': { type: 'string', value: 'fragment' },
      'http.response.status_code': { type: 'integer', value: 200 },
      'http.response.body.size': { type: 'integer', value: 2 },
      'sentry.op': { type: 'string', value: 'http.client' },
      'sentry.origin': { type: 'string', value: 'auto.http.browser' },
      type: { type: 'string', value: 'fetch' },
      'server.address': { type: 'string', value: 'sentry-test-site.example' },
    }),
  });
});

sentryTest(
  'strips hash fragment and query params in same-origin fetch request spans',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    await page.route('**/*', route => route.fulfill({ body: 'ok' }));

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);

    const rootPromise = waitForStreamedSpan(page, span => span.is_segment && span.name === 'rootSpan');
    const requestPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'http.client');
    await page.locator('#btnQueryFragmentSameOrigin').click();
    const [rootSpan, requestSpan] = await Promise.all([rootPromise, requestPromise]);

    expect(rootSpan.name).toBe('rootSpan');

    expect(requestSpan).toMatchObject({
      name: 'GET sentry-test.io',
      parent_span_id: rootSpan.span_id,
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      trace_id: rootSpan.trace_id,
      attributes: expect.objectContaining({
        'http.request.method': { type: 'string', value: 'GET' },
        'url.full': { type: 'string', value: 'http://sentry-test.io/api/users?id=1#fragment' },
        'url.query': { type: 'string', value: 'id=1' },
        'url.fragment': { type: 'string', value: 'fragment' },
        'http.response.status_code': { type: 'integer', value: 200 },
        'http.response.body.size': { type: 'integer', value: 2 },
        'sentry.op': { type: 'string', value: 'http.client' },
        'sentry.origin': { type: 'string', value: 'auto.http.browser' },
        type: { type: 'string', value: 'fetch' },
        'server.address': { type: 'string', value: 'sentry-test.io' },
      }),
    });
  },
);
