import {
  HTTP_REQUEST_METHOD,
  URL_FULL,
  URL_QUERY,
  HTTP_RESPONSE_STATUS_CODE,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  URL_FRAGMENT,
} from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('strips query params in XHR request spans', async ({ getLocalTestUrl, page }) => {
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
      [HTTP_REQUEST_METHOD]: { type: 'string', value: 'GET' },
      [URL_FULL]: { type: 'string', value: 'http://sentry-test-site.example/0?id=123;page=5' },
      [URL_QUERY]: { type: 'string', value: 'id=123;page=5' },
      [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
      [SENTRY_OP]: { type: 'string', value: 'http.client' },
      [SENTRY_ORIGIN]: { type: 'string', value: 'auto.http.browser' },
      type: { type: 'string', value: 'xhr' },
      [SERVER_ADDRESS]: { type: 'string', value: 'sentry-test-site.example' },
    }),
  });

  expect(requestSpan?.attributes).not.toHaveProperty('url.fragment');
});

sentryTest('strips hash fragment in XHR request spans', async ({ getLocalTestUrl, page }) => {
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
      [HTTP_REQUEST_METHOD]: { type: 'string', value: 'GET' },
      [URL_FULL]: { type: 'string', value: 'http://sentry-test-site.example/1#fragment' },
      [URL_FRAGMENT]: { type: 'string', value: 'fragment' },
      [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
      [SENTRY_OP]: { type: 'string', value: 'http.client' },
      [SENTRY_ORIGIN]: { type: 'string', value: 'auto.http.browser' },
      type: { type: 'string', value: 'xhr' },
      [SERVER_ADDRESS]: { type: 'string', value: 'sentry-test-site.example' },
    }),
  });

  expect(requestSpan?.attributes).not.toHaveProperty('url.query');
});

sentryTest('strips hash fragment and query params in XHR request spans', async ({ getLocalTestUrl, page }) => {
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
      [HTTP_REQUEST_METHOD]: { type: 'string', value: 'GET' },
      [URL_FULL]: { type: 'string', value: 'http://sentry-test-site.example/2?id=1#fragment' },
      [URL_QUERY]: { type: 'string', value: 'id=1' },
      [URL_FRAGMENT]: { type: 'string', value: 'fragment' },
      [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
      [SENTRY_OP]: { type: 'string', value: 'http.client' },
      [SENTRY_ORIGIN]: { type: 'string', value: 'auto.http.browser' },
      type: { type: 'string', value: 'xhr' },
      [SERVER_ADDRESS]: { type: 'string', value: 'sentry-test-site.example' },
    }),
  });
});

sentryTest(
  'strips hash fragment and query params in same-origin XHR request spans',
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
        [HTTP_REQUEST_METHOD]: { type: 'string', value: 'GET' },
        [URL_FULL]: { type: 'string', value: 'http://sentry-test.io/api/users?id=1#fragment' },
        [URL_QUERY]: { type: 'string', value: 'id=1' },
        [URL_FRAGMENT]: { type: 'string', value: 'fragment' },
        [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
        [SENTRY_OP]: { type: 'string', value: 'http.client' },
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.http.browser' },
        type: { type: 'string', value: 'xhr' },
        [SERVER_ADDRESS]: { type: 'string', value: 'sentry-test.io' },
      }),
    });
  },
);
