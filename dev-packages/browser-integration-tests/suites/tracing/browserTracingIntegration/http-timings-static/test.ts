import { PAGELOAD, HTTP_CLIENT } from '@sentry/conventions/op';
import {
  HTTP_REQUEST_REDIRECT_START,
  HTTP_REQUEST_REDIRECT_END,
  HTTP_REQUEST_WORKER_START,
  HTTP_REQUEST_FETCH_START,
  HTTP_REQUEST_DOMAIN_LOOKUP_START,
  HTTP_REQUEST_DOMAIN_LOOKUP_END,
  HTTP_REQUEST_CONNECT_START,
  HTTP_REQUEST_SECURE_CONNECTION_START,
  HTTP_REQUEST_CONNECTION_END,
  HTTP_REQUEST_REQUEST_START,
  HTTP_REQUEST_RESPONSE_START,
  HTTP_REQUEST_RESPONSE_END,
  HTTP_REQUEST_TIME_TO_FIRST_BYTE,
  NETWORK_PROTOCOL_VERSION,
} from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest('creates fetch spans with http timing', async ({ browserName, getLocalTestUrl, page }) => {
  const supportedBrowsers = ['chromium', 'firefox'];

  if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
    sentryTest.skip();
  }
  await page.route('http://sentry-test-site.example/*', async route => {
    const request = route.request();
    const postData = await request.postDataJSON();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(Object.assign({ id: 1 }, postData)),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === PAGELOAD);
  await page.goto(url);
  const tracingEvent = envelopeRequestParser(await pageloadPromise);

  const requestSpans = tracingEvent.spans?.filter(({ op }) => op === HTTP_CLIENT);

  expect(requestSpans).toHaveLength(3);

  requestSpans?.forEach((span, index) =>
    expect(span).toMatchObject({
      description: `GET http://sentry-test-site.example/${index}`,
      parent_span_id: tracingEvent.contexts?.trace?.span_id,
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: tracingEvent.contexts?.trace?.trace_id,
      data: expect.objectContaining({
        [HTTP_REQUEST_REDIRECT_START]: expect.any(Number),
        [HTTP_REQUEST_REDIRECT_END]: expect.any(Number),
        [HTTP_REQUEST_WORKER_START]: expect.any(Number),
        [HTTP_REQUEST_FETCH_START]: expect.any(Number),
        [HTTP_REQUEST_DOMAIN_LOOKUP_START]: expect.any(Number),
        [HTTP_REQUEST_DOMAIN_LOOKUP_END]: expect.any(Number),
        [HTTP_REQUEST_CONNECT_START]: expect.any(Number),
        [HTTP_REQUEST_SECURE_CONNECTION_START]: expect.any(Number),
        [HTTP_REQUEST_CONNECTION_END]: expect.any(Number),
        [HTTP_REQUEST_REQUEST_START]: expect.any(Number),
        [HTTP_REQUEST_RESPONSE_START]: expect.any(Number),
        [HTTP_REQUEST_RESPONSE_END]: expect.any(Number),
        [HTTP_REQUEST_TIME_TO_FIRST_BYTE]: expect.any(Number),
        [NETWORK_PROTOCOL_VERSION]: expect.any(String),
      }),
    }),
  );
});
