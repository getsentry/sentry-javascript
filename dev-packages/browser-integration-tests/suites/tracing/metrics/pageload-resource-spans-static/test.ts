import { PAGELOAD, RESOURCE, RESOURCE_SCRIPT, RESOURCE_LINK, RESOURCE_IMG } from '@sentry/conventions/op';
import {
  HTTP_REQUEST_SAME_ORIGIN,
  URL_FULL,
  HTTP_RESPONSE_BODY_DECODED_SIZE,
  HTTP_RESPONSE_BODY_SIZE,
  HTTP_RESPONSE_SIZE,
  HTTP_REQUEST_CONNECT_START,
  HTTP_REQUEST_CONNECTION_END,
  HTTP_REQUEST_DOMAIN_LOOKUP_END,
  HTTP_REQUEST_DOMAIN_LOOKUP_START,
  HTTP_REQUEST_FETCH_START,
  HTTP_REQUEST_REDIRECT_END,
  HTTP_REQUEST_REDIRECT_START,
  HTTP_REQUEST_REQUEST_START,
  HTTP_REQUEST_SECURE_CONNECTION_START,
  HTTP_REQUEST_WORKER_START,
  HTTP_REQUEST_RESPONSE_END,
  HTTP_REQUEST_RESPONSE_START,
  HTTP_REQUEST_TIME_TO_FIRST_BYTE,
  NETWORK_PROTOCOL_NAME,
  NETWORK_PROTOCOL_VERSION,
  SERVER_ADDRESS,
  URL_DOMAIN,
  URL_SCHEME,
  HTTP_RESPONSE_STATUS_CODE,
  RESOURCE_RENDER_BLOCKING_STATUS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { type Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest('adds resource spans to pageload transaction', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const isWebkitRun = browserName === 'webkit';

  // Intercepting asset requests to avoid network-related flakiness and random retries (on Firefox).
  await page.route('https://sentry-test-site.example/path/to/image.svg', (route: Route) =>
    route.fulfill({
      path: `${__dirname}/assets/image.svg`,
      headers: {
        'Timing-Allow-Origin': '*',
        'Content-Type': 'image/svg+xml',
      },
    }),
  );
  await page.route('https://sentry-test-site.example/path/to/script.js', (route: Route) =>
    route.fulfill({
      path: `${__dirname}/assets/script.js`,
      headers: {
        'Timing-Allow-Origin': '*',
        'Content-Type': 'application/javascript',
      },
    }),
  );
  await page.route('https://sentry-test-site.example/path/to/style.css', (route: Route) =>
    route.fulfill({
      path: `${__dirname}/assets/style.css`,
      headers: {
        'Timing-Allow-Origin': '*',
        'Content-Type': 'text/css',
      },
    }),
  );

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === PAGELOAD);
  await page.goto(url);
  const eventData = envelopeRequestParser<Event>(await pageloadPromise);
  const resourceSpans = eventData.spans?.filter(({ op }) => op?.startsWith(RESOURCE));

  const scriptSpans = resourceSpans?.filter(({ op }) => op === RESOURCE_SCRIPT);
  const linkSpan = resourceSpans?.filter(({ op }) => op === RESOURCE_LINK)[0];
  const imgSpan = resourceSpans?.filter(({ op }) => op === RESOURCE_IMG)[0];

  const spanId = eventData.contexts?.trace?.span_id;
  const traceId = eventData.contexts?.trace?.trace_id;

  expect(spanId).toBeDefined();
  expect(traceId).toBeDefined();

  const hasCdnBundle = (process.env.PW_BUNDLE || '').startsWith('bundle');

  const expectedScripts = ['/init.bundle.js', 'https://sentry-test-site.example/path/to/script.js'];
  if (hasCdnBundle) {
    expectedScripts.unshift('/cdn.bundle.js');
  }

  expect(scriptSpans?.map(({ description }) => description).sort()).toEqual(expectedScripts);
  expect(scriptSpans?.map(({ parent_span_id }) => parent_span_id)).toEqual(expectedScripts.map(() => spanId));

  // The init bundle script is served from the test origin: its description is origin-relative,
  // but `url.full` retains the full absolute URL (needed for span description inference).
  const sameOriginScriptSpan = scriptSpans?.find(({ description }) => description === '/init.bundle.js');
  expect(sameOriginScriptSpan?.data?.[HTTP_REQUEST_SAME_ORIGIN]).toBe(true);
  expect(sameOriginScriptSpan?.data?.[URL_FULL]).toMatch(/^https?:\/\/.+\/init\.bundle\.js$/);

  const customScriptSpan = scriptSpans?.find(
    ({ description }) => description === 'https://sentry-test-site.example/path/to/script.js',
  );

  expect(imgSpan).toEqual({
    data: {
      [HTTP_RESPONSE_BODY_DECODED_SIZE]: expect.any(Number),
      [HTTP_RESPONSE_BODY_SIZE]: expect.any(Number),
      [HTTP_RESPONSE_SIZE]: expect.any(Number),
      [HTTP_REQUEST_CONNECT_START]: expect.any(Number),
      [HTTP_REQUEST_CONNECTION_END]: expect.any(Number),
      [HTTP_REQUEST_DOMAIN_LOOKUP_END]: expect.any(Number),
      [HTTP_REQUEST_DOMAIN_LOOKUP_START]: expect.any(Number),
      [HTTP_REQUEST_FETCH_START]: expect.any(Number),
      [HTTP_REQUEST_REDIRECT_END]: expect.any(Number),
      [HTTP_REQUEST_REDIRECT_START]: expect.any(Number),
      [HTTP_REQUEST_REQUEST_START]: expect.any(Number),
      [HTTP_REQUEST_SECURE_CONNECTION_START]: expect.any(Number),
      [HTTP_REQUEST_WORKER_START]: expect.any(Number),
      [HTTP_REQUEST_RESPONSE_END]: expect.any(Number),
      [HTTP_REQUEST_RESPONSE_START]: expect.any(Number),
      [HTTP_REQUEST_TIME_TO_FIRST_BYTE]: expect.any(Number),
      [NETWORK_PROTOCOL_NAME]: '',
      [NETWORK_PROTOCOL_VERSION]: 'unknown',
      [SENTRY_OP]: RESOURCE_IMG,
      [SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
      [SERVER_ADDRESS]: 'sentry-test-site.example',
      [URL_DOMAIN]: 'sentry-test-site.example',
      [HTTP_REQUEST_SAME_ORIGIN]: false,
      [URL_SCHEME]: 'https',
      [URL_FULL]: 'https://sentry-test-site.example/path/to/image.svg',
      // WebKit reports `deliveryType` as of Playwright 1.63's build, but still no response status
      // or render blocking status.
      'http.response_delivery_type': '',
      ...(!isWebkitRun && {
        [HTTP_RESPONSE_STATUS_CODE]: expect.any(Number),
        [RESOURCE_RENDER_BLOCKING_STATUS]: 'non-blocking',
      }),
    },
    description: 'https://sentry-test-site.example/path/to/image.svg',
    op: RESOURCE_IMG,
    origin: 'auto.resource.browser.metrics',
    status: 'ok',
    parent_span_id: spanId,
    span_id: expect.stringMatching(/^[a-f\d]{16}$/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: traceId,
  });

  // range check: TTFB is reasonably <10 seconds, which is really a check that we report it in
  // seconds rather than milliseconds. WebKit resolves these intercepted routes without measurable
  // delay, so only the other engines are held to a non-zero value.
  const imgSpanTtfb = imgSpan?.data[HTTP_REQUEST_TIME_TO_FIRST_BYTE];
  expect(imgSpanTtfb).toBeGreaterThan(isWebkitRun ? -1 : 0);
  expect(imgSpanTtfb).toBeLessThan(10);

  expect(linkSpan).toEqual({
    data: {
      [HTTP_RESPONSE_BODY_DECODED_SIZE]: expect.any(Number),
      [HTTP_RESPONSE_BODY_SIZE]: expect.any(Number),
      [HTTP_RESPONSE_SIZE]: expect.any(Number),
      [HTTP_REQUEST_CONNECT_START]: expect.any(Number),
      [HTTP_REQUEST_CONNECTION_END]: expect.any(Number),
      [HTTP_REQUEST_DOMAIN_LOOKUP_END]: expect.any(Number),
      [HTTP_REQUEST_DOMAIN_LOOKUP_START]: expect.any(Number),
      [HTTP_REQUEST_FETCH_START]: expect.any(Number),
      [HTTP_REQUEST_REDIRECT_END]: expect.any(Number),
      [HTTP_REQUEST_REDIRECT_START]: expect.any(Number),
      [HTTP_REQUEST_REQUEST_START]: expect.any(Number),
      [HTTP_REQUEST_SECURE_CONNECTION_START]: expect.any(Number),
      [HTTP_REQUEST_WORKER_START]: expect.any(Number),
      [HTTP_REQUEST_RESPONSE_END]: expect.any(Number),
      [HTTP_REQUEST_RESPONSE_START]: expect.any(Number),
      [HTTP_REQUEST_TIME_TO_FIRST_BYTE]: expect.any(Number),
      [NETWORK_PROTOCOL_NAME]: '',
      [NETWORK_PROTOCOL_VERSION]: 'unknown',
      [SENTRY_OP]: RESOURCE_LINK,
      [SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
      [SERVER_ADDRESS]: 'sentry-test-site.example',
      [URL_DOMAIN]: 'sentry-test-site.example',
      [HTTP_REQUEST_SAME_ORIGIN]: false,
      [URL_SCHEME]: 'https',
      [URL_FULL]: 'https://sentry-test-site.example/path/to/style.css',
      // WebKit reports `deliveryType` as of Playwright 1.63's build, but still no response status
      // or render blocking status.
      'http.response_delivery_type': '',
      ...(!isWebkitRun && {
        [HTTP_RESPONSE_STATUS_CODE]: expect.any(Number),
        [RESOURCE_RENDER_BLOCKING_STATUS]: 'non-blocking',
      }),
    },
    description: 'https://sentry-test-site.example/path/to/style.css',
    op: RESOURCE_LINK,
    origin: 'auto.resource.browser.metrics',
    status: 'ok',
    parent_span_id: spanId,
    span_id: expect.stringMatching(/^[a-f\d]{16}$/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: traceId,
  });

  expect(customScriptSpan).toEqual({
    data: {
      [HTTP_RESPONSE_BODY_DECODED_SIZE]: expect.any(Number),
      [HTTP_RESPONSE_BODY_SIZE]: expect.any(Number),
      [HTTP_RESPONSE_SIZE]: expect.any(Number),
      [HTTP_REQUEST_CONNECTION_END]: expect.any(Number),
      [HTTP_REQUEST_CONNECT_START]: expect.any(Number),
      [HTTP_REQUEST_DOMAIN_LOOKUP_END]: expect.any(Number),
      [HTTP_REQUEST_DOMAIN_LOOKUP_START]: expect.any(Number),
      [HTTP_REQUEST_FETCH_START]: expect.any(Number),
      [HTTP_REQUEST_REDIRECT_END]: expect.any(Number),
      [HTTP_REQUEST_REDIRECT_START]: expect.any(Number),
      [HTTP_REQUEST_REQUEST_START]: expect.any(Number),
      [HTTP_REQUEST_SECURE_CONNECTION_START]: expect.any(Number),
      [HTTP_REQUEST_WORKER_START]: expect.any(Number),
      [HTTP_REQUEST_RESPONSE_END]: expect.any(Number),
      [HTTP_REQUEST_RESPONSE_START]: expect.any(Number),
      [HTTP_REQUEST_TIME_TO_FIRST_BYTE]: expect.any(Number),
      [NETWORK_PROTOCOL_NAME]: '',
      [NETWORK_PROTOCOL_VERSION]: 'unknown',
      [SENTRY_OP]: RESOURCE_SCRIPT,
      [SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
      [SERVER_ADDRESS]: 'sentry-test-site.example',
      [URL_DOMAIN]: 'sentry-test-site.example',
      [HTTP_REQUEST_SAME_ORIGIN]: false,
      [URL_SCHEME]: 'https',
      [URL_FULL]: 'https://sentry-test-site.example/path/to/script.js',
      // WebKit reports `deliveryType` as of Playwright 1.63's build, but still no response status
      // or render blocking status.
      'http.response_delivery_type': '',
      ...(!isWebkitRun && {
        [HTTP_RESPONSE_STATUS_CODE]: expect.any(Number),
        [RESOURCE_RENDER_BLOCKING_STATUS]: 'non-blocking',
      }),
    },
    description: 'https://sentry-test-site.example/path/to/script.js',
    op: RESOURCE_SCRIPT,
    origin: 'auto.resource.browser.metrics',
    status: 'ok',
    parent_span_id: spanId,
    span_id: expect.stringMatching(/^[a-f\d]{16}$/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: traceId,
  });
});
