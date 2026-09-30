import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
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
    const externalResources = spans.filter(span => span.attributes['url.domain']?.value === 'sentry-test-site.example');
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
      span => span.attributes['url.domain']?.value === 'sentry-test-site.example',
    );
    const sameOriginScriptSpan = scriptSpans.find(
      span => span.attributes['url.full']?.value === new URL('init.bundle.js', url).href,
    );
    const spanId = pageload.span_id;
    const traceId = pageload.trace_id;
    const expectedScripts = [new URL('init.bundle.js', url).href, 'https://sentry-test-site.example/path/to/script.js'];
    if ((process.env.PW_BUNDLE || '').startsWith('bundle')) {
      expectedScripts.push(new URL('cdn.bundle.js', url).href);
    }
    expect(scriptSpans.map(span => span.attributes['url.full']?.value).sort()).toEqual(expectedScripts.sort());
    expect(scriptSpans.map(span => span.parent_span_id)).toEqual(expectedScripts.map(() => spanId));
    expect(sameOriginScriptSpan?.name).toBe('sentry-test.io');
    expect(sameOriginScriptSpan?.attributes['http.request.same_origin']).toEqual({ type: 'boolean', value: true });

    expect(imgSpan).toMatchObject({
      attributes: {
        'http.response.body.decoded_size': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'http.response.body.size': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.response.size': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.connect_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.connection_end': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.domain_lookup_end': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'http.request.domain_lookup_start': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'http.request.fetch_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.redirect_end': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.redirect_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.request_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.secure_connection_start': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'http.request.worker_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.response_end': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.response_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.time_to_first_byte': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'network.protocol.name': { type: 'string', value: '' },
        'network.protocol.version': { type: 'string', value: 'unknown' },
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'resource.img' },
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.resource.browser.metrics' },
        'server.address': { type: 'string', value: 'sentry-test-site.example' },
        'url.domain': { type: 'string', value: 'sentry-test-site.example' },
        'http.request.same_origin': { type: 'boolean', value: false },
        'url.scheme': { type: 'string', value: 'https' },
        'url.full': { type: 'string', value: 'https://sentry-test-site.example/path/to/image.svg' },
        // WebKit reports `deliveryType` as of Playwright 1.63's build, but still no response status
        // or render blocking status.
        'http.response_delivery_type': { type: 'string', value: '' },
        ...(!isWebkitRun && {
          'http.response.status_code': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          'resource.render_blocking_status': { type: 'string', value: 'non-blocking' },
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
    const imgSpanTtfb = imgSpan?.attributes['http.request.time_to_first_byte']?.value;
    expect(imgSpanTtfb).toBeGreaterThan(isWebkitRun ? -1 : 0);
    expect(imgSpanTtfb).toBeLessThan(10);

    expect(linkSpan).toMatchObject({
      attributes: {
        'http.response.body.decoded_size': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'http.response.body.size': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.response.size': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.connect_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.connection_end': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.domain_lookup_end': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'http.request.domain_lookup_start': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'http.request.fetch_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.redirect_end': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.redirect_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.request_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.secure_connection_start': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'http.request.worker_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.response_end': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.response_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.time_to_first_byte': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'network.protocol.name': { type: 'string', value: '' },
        'network.protocol.version': { type: 'string', value: 'unknown' },
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'resource.link' },
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.resource.browser.metrics' },
        'server.address': { type: 'string', value: 'sentry-test-site.example' },
        'url.domain': { type: 'string', value: 'sentry-test-site.example' },
        'http.request.same_origin': { type: 'boolean', value: false },
        'url.scheme': { type: 'string', value: 'https' },
        'url.full': { type: 'string', value: 'https://sentry-test-site.example/path/to/style.css' },
        // WebKit reports `deliveryType` as of Playwright 1.63's build, but still no response status
        // or render blocking status.
        'http.response_delivery_type': { type: 'string', value: '' },
        ...(!isWebkitRun && {
          'http.response.status_code': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          'resource.render_blocking_status': { type: 'string', value: 'non-blocking' },
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
        'http.response.body.decoded_size': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'http.response.body.size': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.response.size': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.connection_end': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.connect_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.domain_lookup_end': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'http.request.domain_lookup_start': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'http.request.fetch_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.redirect_end': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.redirect_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.request_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.secure_connection_start': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'http.request.worker_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.response_end': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.response_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
        'http.request.time_to_first_byte': {
          type: expect.stringMatching(/^(integer|double)$/),
          value: expect.any(Number),
        },
        'network.protocol.name': { type: 'string', value: '' },
        'network.protocol.version': { type: 'string', value: 'unknown' },
        'sentry.op': { type: 'string', value: 'resource.script' },
        'sentry.origin': { type: 'string', value: 'auto.resource.browser.metrics' },
        'server.address': { type: 'string', value: 'sentry-test-site.example' },
        'url.domain': { type: 'string', value: 'sentry-test-site.example' },
        'http.request.same_origin': { type: 'boolean', value: false },
        'url.scheme': { type: 'string', value: 'https' },
        'url.full': { type: 'string', value: 'https://sentry-test-site.example/path/to/script.js' },
        // WebKit reports `deliveryType` as of Playwright 1.63's build, but still no response status
        // or render blocking status.
        'http.response_delivery_type': { type: 'string', value: '' },
        ...(!isWebkitRun && {
          'http.response.status_code': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          'resource.render_blocking_status': { type: 'string', value: 'non-blocking' },
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
