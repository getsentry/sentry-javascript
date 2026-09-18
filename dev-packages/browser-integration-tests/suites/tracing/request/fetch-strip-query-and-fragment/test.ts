import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest('strips query params in fetch request spans', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const txnPromise = waitForTransactionRequest(page);
  await page.locator('#btnQuery').click();
  const transactionEvent = envelopeRequestParser(await txnPromise);

  expect(transactionEvent.transaction).toEqual('rootSpan');

  const requestSpan = transactionEvent.spans?.find(({ op }) => op === 'http.client');

  expect(requestSpan).toMatchObject({
    description: 'GET http://sentry-test-site.example/0',
    parent_span_id: transactionEvent.contexts?.trace?.span_id,
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: transactionEvent.contexts?.trace?.trace_id,
    data: expect.objectContaining({
      'http.request.method': 'GET',
      'url.full': 'http://sentry-test-site.example/0?id=123;page=5',
      'url.query': 'id=123;page=5',
      'http.response.status_code': 200,
      'http.response.body.size': 2,
      'sentry.op': 'http.client',
      'sentry.origin': 'auto.http.browser',
      type: 'fetch',
      'server.address': 'sentry-test-site.example',
    }),
  });

  expect(requestSpan?.data).not.toHaveProperty('url.fragment');
});

sentryTest('strips hash fragment in fetch request spans', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const txnPromise = waitForTransactionRequest(page);
  await page.locator('#btnFragment').click();
  const transactionEvent = envelopeRequestParser(await txnPromise);

  expect(transactionEvent.transaction).toEqual('rootSpan');

  const requestSpan = transactionEvent.spans?.find(({ op }) => op === 'http.client');

  expect(requestSpan).toMatchObject({
    description: 'GET http://sentry-test-site.example/1',
    parent_span_id: transactionEvent.contexts?.trace?.span_id,
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: transactionEvent.contexts?.trace?.trace_id,
    data: expect.objectContaining({
      'http.request.method': 'GET',
      'url.full': 'http://sentry-test-site.example/1#fragment',
      'url.fragment': 'fragment',
      'http.response.status_code': 200,
      'http.response.body.size': 2,
      'sentry.op': 'http.client',
      'sentry.origin': 'auto.http.browser',
      type: 'fetch',
      'server.address': 'sentry-test-site.example',
    }),
  });

  expect(requestSpan?.data).not.toHaveProperty('url.query');
});

sentryTest('strips hash fragment and query params in fetch request spans', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const txnPromise = waitForTransactionRequest(page);
  await page.locator('#btnQueryFragment').click();
  const transactionEvent = envelopeRequestParser(await txnPromise);

  expect(transactionEvent.transaction).toEqual('rootSpan');

  const requestSpan = transactionEvent.spans?.find(({ op }) => op === 'http.client');

  expect(requestSpan).toMatchObject({
    description: 'GET http://sentry-test-site.example/2',
    parent_span_id: transactionEvent.contexts?.trace?.span_id,
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: transactionEvent.contexts?.trace?.trace_id,
    data: expect.objectContaining({
      'http.request.method': 'GET',
      'url.full': 'http://sentry-test-site.example/2?id=1#fragment',
      'url.query': 'id=1',
      'url.fragment': 'fragment',
      'http.response.status_code': 200,
      'http.response.body.size': 2,
      'sentry.op': 'http.client',
      'sentry.origin': 'auto.http.browser',
      type: 'fetch',
      'server.address': 'sentry-test-site.example',
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

    const txnPromise = waitForTransactionRequest(page);
    await page.locator('#btnQueryFragmentSameOrigin').click();
    const transactionEvent = envelopeRequestParser(await txnPromise);

    expect(transactionEvent.transaction).toEqual('rootSpan');

    const requestSpan = transactionEvent.spans?.find(({ op }) => op === 'http.client');

    expect(requestSpan).toMatchObject({
      description: 'GET /api/users',
      parent_span_id: transactionEvent.contexts?.trace?.span_id,
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: transactionEvent.contexts?.trace?.trace_id,
      data: expect.objectContaining({
        'http.request.method': 'GET',
        'url.full': 'http://sentry-test.io/api/users?id=1#fragment',
        'url.query': 'id=1',
        'url.fragment': 'fragment',
        'http.response.status_code': 200,
        'http.response.body.size': 2,
        'sentry.op': 'http.client',
        'sentry.origin': 'auto.http.browser',
        type: 'fetch',
        'server.address': 'sentry-test.io',
      }),
    });
  },
);
