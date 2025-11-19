import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { type Event, SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

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

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const resourceSpans = eventData.spans?.filter(({ op }) => op?.startsWith('resource'));

  const scriptSpans = resourceSpans?.filter(({ op }) => op === 'resource.script');
  const linkSpan = resourceSpans?.filter(({ op }) => op === 'resource.link')[0];
  const imgSpan = resourceSpans?.filter(({ op }) => op === 'resource.img')[0];

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

  const customScriptSpan = scriptSpans?.find(
    ({ description }) => description === 'https://sentry-test-site.example/path/to/script.js',
  );

  expect(imgSpan).toEqual({
    data: {
      'http.decoded_response_content_length': expect.any(Number),
      'http.response_content_length': expect.any(Number),
      'http.response_transfer_size': expect.any(Number),
      'http.request.connect_start': expect.any(Number),
      'http.request.connection_end': expect.any(Number),
      'http.request.domain_lookup_end': expect.any(Number),
      'http.request.domain_lookup_start': expect.any(Number),
      'http.request.fetch_start': expect.any(Number),
      'http.request.redirect_end': expect.any(Number),
      'http.request.redirect_start': expect.any(Number),
      'http.request.request_start': expect.any(Number),
      'http.request.secure_connection_start': expect.any(Number),
      'http.request.worker_start': expect.any(Number),
      'http.request.response_end': expect.any(Number),
      'http.request.response_start': expect.any(Number),
      'http.request.time_to_first_byte': expect.any(Number),
      'network.protocol.name': '',
      'network.protocol.version': 'unknown',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'resource.img',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
      'server.address': 'sentry-test-site.example',
      'url.same_origin': false,
      'url.scheme': 'https',
      ...(!isWebkitRun && {
        'http.response.status_code': expect.any(Number),
        'resource.render_blocking_status': 'non-blocking',
        'http.response_delivery_type': '',
      }),
    },
    description: 'https://sentry-test-site.example/path/to/image.svg',
    op: 'resource.img',
    origin: 'auto.resource.browser.metrics',
    parent_span_id: spanId,
    span_id: expect.stringMatching(/^[a-f\d]{16}$/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: traceId,
  });

  // range check: TTFB must be >0 (at least in this case) and it's reasonable to
  // assume <10 seconds. This also tests that we're reporting TTFB in seconds.
  const imgSpanTtfb = imgSpan?.data['http.request.time_to_first_byte'];
  expect(imgSpanTtfb).toBeGreaterThan(0);
  expect(imgSpanTtfb).toBeLessThan(10);

  expect(linkSpan).toEqual({
    data: {
      'http.decoded_response_content_length': expect.any(Number),
      'http.response_content_length': expect.any(Number),
      'http.response_transfer_size': expect.any(Number),
      'http.request.connect_start': expect.any(Number),
      'http.request.connection_end': expect.any(Number),
      'http.request.domain_lookup_end': expect.any(Number),
      'http.request.domain_lookup_start': expect.any(Number),
      'http.request.fetch_start': expect.any(Number),
      'http.request.redirect_end': expect.any(Number),
      'http.request.redirect_start': expect.any(Number),
      'http.request.request_start': expect.any(Number),
      'http.request.secure_connection_start': expect.any(Number),
      'http.request.worker_start': expect.any(Number),
      'http.request.response_end': expect.any(Number),
      'http.request.response_start': expect.any(Number),
      'http.request.time_to_first_byte': expect.any(Number),
      'network.protocol.name': '',
      'network.protocol.version': 'unknown',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'resource.link',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
      'server.address': 'sentry-test-site.example',
      'url.same_origin': false,
      'url.scheme': 'https',
      ...(!isWebkitRun && {
        'http.response.status_code': expect.any(Number),
        'resource.render_blocking_status': 'non-blocking',
        'http.response_delivery_type': '',
      }),
    },
    description: 'https://sentry-test-site.example/path/to/style.css',
    op: 'resource.link',
    origin: 'auto.resource.browser.metrics',
    parent_span_id: spanId,
    span_id: expect.stringMatching(/^[a-f\d]{16}$/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: traceId,
  });

  expect(customScriptSpan).toEqual({
    data: {
      'http.decoded_response_content_length': expect.any(Number),
      'http.response_content_length': expect.any(Number),
      'http.response_transfer_size': expect.any(Number),
      'http.request.connection_end': expect.any(Number),
      'http.request.connect_start': expect.any(Number),
      'http.request.domain_lookup_end': expect.any(Number),
      'http.request.domain_lookup_start': expect.any(Number),
      'http.request.fetch_start': expect.any(Number),
      'http.request.redirect_end': expect.any(Number),
      'http.request.redirect_start': expect.any(Number),
      'http.request.request_start': expect.any(Number),
      'http.request.secure_connection_start': expect.any(Number),
      'http.request.worker_start': expect.any(Number),
      'http.request.response_end': expect.any(Number),
      'http.request.response_start': expect.any(Number),
      'http.request.time_to_first_byte': expect.any(Number),
      'network.protocol.name': '',
      'network.protocol.version': 'unknown',
      'sentry.op': 'resource.script',
      'sentry.origin': 'auto.resource.browser.metrics',
      'server.address': 'sentry-test-site.example',
      'url.same_origin': false,
      'url.scheme': 'https',
      ...(!isWebkitRun && {
        'http.response.status_code': expect.any(Number),
        'resource.render_blocking_status': 'non-blocking',
        'http.response_delivery_type': '',
      }),
    },
    description: 'https://sentry-test-site.example/path/to/script.js',
    op: 'resource.script',
    origin: 'auto.resource.browser.metrics',
    parent_span_id: spanId,
    span_id: expect.stringMatching(/^[a-f\d]{16}$/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: traceId,
  });
});
