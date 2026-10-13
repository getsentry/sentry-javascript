import {
  URL_DOMAIN,
  URL_FULL,
  HTTP_REQUEST_SAME_ORIGIN,
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
  URL_SCHEME,
  HTTP_RESPONSE_STATUS_CODE,
  RESOURCE_RENDER_BLOCKING_STATUS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

const assetsDir = `${__dirname}/assets`;

sentryTest(
  'names streamed resource spans after the resource domain',
  async ({ getLocalTestUrl, page, browserName }) => {
    sentryTest.skip(shouldSkipTracingTest());

    // Intercepting asset requests to avoid network-related flakiness and random retries (on Firefox).
    await page.route('https://sentry-test-site.example/path/to/image.svg', (route: Route) =>
      route.fulfill({
        path: `${assetsDir}/image.svg`,
        headers: {
          'Timing-Allow-Origin': '*',
          'Content-Type': 'image/svg+xml',
        },
      }),
    );
    await page.route('https://sentry-test-site.example/path/to/script.js', (route: Route) =>
      route.fulfill({
        path: `${assetsDir}/script.js`,
        headers: {
          'Timing-Allow-Origin': '*',
          'Content-Type': 'application/javascript',
        },
      }),
    );
    await page.route('https://sentry-test-site.example/path/to/style.css', (route: Route) =>
      route.fulfill({
        path: `${assetsDir}/style.css`,
        headers: {
          'Timing-Allow-Origin': '*',
          'Content-Type': 'text/css',
        },
      }),
    );

    const spans = collectStreamedSpans(page);
    const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);
    const pageload = await pageloadPromise;
    await page.evaluate(() => (window as any).Sentry.flush());
    const externalResources = spans.filter(span => span.attributes[URL_DOMAIN]?.value === 'sentry-test-site.example');
    expect(externalResources).toHaveLength(3);
    externalResources.forEach(span => {
      expect(span.parent_span_id).toBe(pageload.span_id);
      expect(span.trace_id).toBe(pageload.trace_id);
    });

    const isWebkitRun = browserName === 'webkit';
    const resourceSpans = spans.filter(span => getSpanOp(span)?.startsWith('resource'));
    const scriptSpans = resourceSpans.filter(span => getSpanOp(span) === 'resource.script');
    const imgSpan = resourceSpans.find(span => getSpanOp(span) === 'resource.img');
    const linkSpan = resourceSpans.find(span => getSpanOp(span) === 'resource.link');
    const customScriptSpan = scriptSpans.find(
      span => span.attributes[URL_DOMAIN]?.value === 'sentry-test-site.example',
    );
    const sameOriginScriptSpan = scriptSpans.find(
      span => span.attributes[URL_FULL]?.value === new URL('init.bundle.js', url).href,
    );
    const spanId = pageload.span_id;
    const traceId = pageload.trace_id;
    const expectedScripts = [new URL('init.bundle.js', url).href, 'https://sentry-test-site.example/path/to/script.js'];
    if ((process.env.PW_BUNDLE || '').startsWith('bundle')) {
      expectedScripts.push(new URL('cdn.bundle.js', url).href);
    }
    expect(scriptSpans.map(span => span.attributes[URL_FULL]?.value).sort()).toEqual(expectedScripts.sort());
    expect(scriptSpans.map(span => span.parent_span_id)).toEqual(expectedScripts.map(() => spanId));
    expect(sameOriginScriptSpan?.name).toBe('sentry-test.io');
    expect(sameOriginScriptSpan?.attributes[HTTP_REQUEST_SAME_ORIGIN]).toEqual({ type: 'boolean', value: true });

    expect(imgSpan).toMatchObject({
      attributes: {
        [HTTP_RESPONSE_BODY_DECODED_SIZE]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [HTTP_RESPONSE_BODY_SIZE]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_RESPONSE_SIZE]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_CONNECT_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_CONNECTION_END]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_DOMAIN_LOOKUP_END]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [HTTP_REQUEST_DOMAIN_LOOKUP_START]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [HTTP_REQUEST_FETCH_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_REDIRECT_END]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_REDIRECT_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_REQUEST_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_SECURE_CONNECTION_START]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [HTTP_REQUEST_WORKER_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_RESPONSE_END]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_RESPONSE_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_TIME_TO_FIRST_BYTE]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [NETWORK_PROTOCOL_NAME]: { type: 'string', value: '' },
        [NETWORK_PROTOCOL_VERSION]: { type: 'string', value: 'unknown' },
        [SENTRY_OP]: { type: 'string', value: 'resource.img' },
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.resource.browser.metrics' },
        [SERVER_ADDRESS]: { type: 'string', value: 'sentry-test-site.example' },
        [URL_DOMAIN]: { type: 'string', value: 'sentry-test-site.example' },
        [HTTP_REQUEST_SAME_ORIGIN]: { type: 'boolean', value: false },
        [URL_SCHEME]: { type: 'string', value: 'https' },
        [URL_FULL]: { type: 'string', value: 'https://sentry-test-site.example/path/to/image.svg' },
        // WebKit reports `deliveryType` as of Playwright 1.63's build, but still no response status
        // or render blocking status.
        'http.response_delivery_type': { type: 'string', value: '' },
        ...(!isWebkitRun && {
          [HTTP_RESPONSE_STATUS_CODE]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          [RESOURCE_RENDER_BLOCKING_STATUS]: { type: 'string', value: 'non-blocking' },
        }),
      },
      name: 'sentry-test-site.example',
      status: 'ok',
      parent_span_id: spanId,
      span_id: expect.stringMatching(/^[a-f\d]{16}$/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      trace_id: traceId,
    });

    // range check: TTFB is reasonably <10 seconds, which is really a check that we report it in
    // seconds rather than milliseconds. WebKit resolves these intercepted routes without measurable
    // delay, so only the other engines are held to a non-zero value.
    const imgSpanTtfb = imgSpan?.attributes[HTTP_REQUEST_TIME_TO_FIRST_BYTE]?.value;
    expect(imgSpanTtfb).toBeGreaterThan(isWebkitRun ? -1 : 0);
    expect(imgSpanTtfb).toBeLessThan(10);

    expect(linkSpan).toMatchObject({
      attributes: {
        [HTTP_RESPONSE_BODY_DECODED_SIZE]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [HTTP_RESPONSE_BODY_SIZE]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_RESPONSE_SIZE]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_CONNECT_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_CONNECTION_END]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_DOMAIN_LOOKUP_END]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [HTTP_REQUEST_DOMAIN_LOOKUP_START]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [HTTP_REQUEST_FETCH_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_REDIRECT_END]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_REDIRECT_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_REQUEST_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_SECURE_CONNECTION_START]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [HTTP_REQUEST_WORKER_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_RESPONSE_END]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_RESPONSE_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_TIME_TO_FIRST_BYTE]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [NETWORK_PROTOCOL_NAME]: { type: 'string', value: '' },
        [NETWORK_PROTOCOL_VERSION]: { type: 'string', value: 'unknown' },
        [SENTRY_OP]: { type: 'string', value: 'resource.link' },
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.resource.browser.metrics' },
        [SERVER_ADDRESS]: { type: 'string', value: 'sentry-test-site.example' },
        [URL_DOMAIN]: { type: 'string', value: 'sentry-test-site.example' },
        [HTTP_REQUEST_SAME_ORIGIN]: { type: 'boolean', value: false },
        [URL_SCHEME]: { type: 'string', value: 'https' },
        [URL_FULL]: { type: 'string', value: 'https://sentry-test-site.example/path/to/style.css' },
        // WebKit reports `deliveryType` as of Playwright 1.63's build, but still no response status
        // or render blocking status.
        'http.response_delivery_type': { type: 'string', value: '' },
        ...(!isWebkitRun && {
          [HTTP_RESPONSE_STATUS_CODE]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          [RESOURCE_RENDER_BLOCKING_STATUS]: { type: 'string', value: 'non-blocking' },
        }),
      },
      name: 'sentry-test-site.example',
      status: 'ok',
      parent_span_id: spanId,
      span_id: expect.stringMatching(/^[a-f\d]{16}$/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      trace_id: traceId,
    });

    expect(customScriptSpan).toMatchObject({
      attributes: {
        [HTTP_RESPONSE_BODY_DECODED_SIZE]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [HTTP_RESPONSE_BODY_SIZE]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_RESPONSE_SIZE]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_CONNECTION_END]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_CONNECT_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_DOMAIN_LOOKUP_END]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [HTTP_REQUEST_DOMAIN_LOOKUP_START]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [HTTP_REQUEST_FETCH_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_REDIRECT_END]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_REDIRECT_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_REQUEST_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_SECURE_CONNECTION_START]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [HTTP_REQUEST_WORKER_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_RESPONSE_END]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_RESPONSE_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        [HTTP_REQUEST_TIME_TO_FIRST_BYTE]: {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        [NETWORK_PROTOCOL_NAME]: { type: 'string', value: '' },
        [NETWORK_PROTOCOL_VERSION]: { type: 'string', value: 'unknown' },
        [SENTRY_OP]: { type: 'string', value: 'resource.script' },
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.resource.browser.metrics' },
        [SERVER_ADDRESS]: { type: 'string', value: 'sentry-test-site.example' },
        [URL_DOMAIN]: { type: 'string', value: 'sentry-test-site.example' },
        [HTTP_REQUEST_SAME_ORIGIN]: { type: 'boolean', value: false },
        [URL_SCHEME]: { type: 'string', value: 'https' },
        [URL_FULL]: { type: 'string', value: 'https://sentry-test-site.example/path/to/script.js' },
        // WebKit reports `deliveryType` as of Playwright 1.63's build, but still no response status
        // or render blocking status.
        'http.response_delivery_type': { type: 'string', value: '' },
        ...(!isWebkitRun && {
          [HTTP_RESPONSE_STATUS_CODE]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          [RESOURCE_RENDER_BLOCKING_STATUS]: { type: 'string', value: 'non-blocking' },
        }),
      },
      name: 'sentry-test-site.example',
      status: 'ok',
      parent_span_id: spanId,
      span_id: expect.stringMatching(/^[a-f\d]{16}$/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      trace_id: traceId,
    });
  },
);
