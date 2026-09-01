import { expect, test } from '@playwright/test';
import {
  collectStreamedSpans,
  getSpanOp,
  waitForStreamedSpan,
  waitForStreamedSpans,
} from '@sentry-internal/test-utils';

const BROWSER_TIMING_OPS = [
  'browser.dom_content_loaded_event',
  'browser.connect',
  'browser.request',
  'browser.response',
];

test('Captures a pageload span', async ({ page }) => {
  const spansPromise = collectStreamedSpans('react-create-hash-router', spans => {
    return spans.some(span => getSpanOp(span) === 'pageload' && span.is_segment);
  });

  await page.goto('/');

  const spans = await spansPromise;
  const pageloadSpan = spans.find(span => getSpanOp(span) === 'pageload' && span.is_segment)!;

  expect(pageloadSpan.name).toBe('/');
  expect(pageloadSpan.status).toBe('ok');
  expect(pageloadSpan.span_id).toMatch(/[a-f0-9]{16}/);
  expect(pageloadSpan.trace_id).toMatch(/[a-f0-9]{32}/);

  // LCP is streamed as its own `ui.webvital.lcp` span once the page is hidden, so it is no longer
  // part of the pageload span's attributes.
  expect(pageloadSpan.attributes).toEqual({
    'device.memory.estimated_capacity': { value: expect.any(Number), type: expect.any(String) },
    'device.processor_count': { value: expect.any(Number), type: 'integer' },
    'network.connection.effective_type': { value: expect.any(String), type: 'string' },
    'browser.performance.time_origin': { value: expect.any(Number), type: expect.any(String) },
    'browser.performance.navigation.activation_start': { value: expect.any(Number), type: expect.any(String) },
    'sentry.idle_span_finish_reason': { value: 'idleTimeout', type: 'string' },
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter_v6', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/', type: 'string' },
    'url.full': { value: 'http://localhost:3030/', type: 'string' },
    'url.path': { value: '/', type: 'string' },
  });

  for (const op of BROWSER_TIMING_OPS) {
    expect(spans).toContainEqual(
      expect.objectContaining({
        name: page.url(),
        is_segment: false,
        status: 'ok',
        parent_span_id: pageloadSpan.span_id,
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: pageloadSpan.trace_id,
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        attributes: {
          'sentry.origin': { value: 'auto.ui.browser.metrics', type: 'string' },
          'sentry.op': { value: op, type: 'string' },
        },
      }),
    );
  }
});

test('Captures a navigation span', async ({ page }) => {
  const spansPromise = waitForStreamedSpans('react-create-hash-router', spans => {
    return spans.some(span => getSpanOp(span) === 'navigation' && span.is_segment);
  });

  await page.goto('/');
  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const spans = await spansPromise;
  const navigationSpan = spans.find(span => span.is_segment)!;

  expect(navigationSpan.name).toBe('/user/:id');
  expect(navigationSpan.status).toBe('ok');

  expect(navigationSpan.attributes).toMatchObject({
    'device.memory.estimated_capacity': { value: expect.any(Number), type: expect.any(String) },
    'device.processor_count': { value: expect.any(Number), type: 'integer' },
    'network.connection.effective_type': { value: expect.any(String), type: 'string' },
    'sentry.idle_span_finish_reason': { value: 'idleTimeout', type: 'string' },
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.react.reactrouter_v6', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/user/:id', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: expect.stringMatching(/^http:\/\/localhost:3030\/#\/user\/5$/), type: 'string' },
  });

  expect(navigationSpan.links).toEqual([
    {
      attributes: {
        'sentry.link.type': { value: 'previous_trace', type: 'string' },
      },
      sampled: true,
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    },
  ]);

  // Filter out favicon spans which may or may not be present depending on the browser version
  const childSpans = spans.filter(
    span => !span.is_segment && !(span.attributes['url.full']?.value as string | undefined)?.includes('favicon'),
  );
  expect(childSpans).toEqual([]);
});

test('Captures a parameterized path pageload span', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-hash-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/#/v2/post/1');

  const span = await spanPromise;

  expect(span.name).toBe('/v2/post/:post');
  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/v2/post/:post', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: 'http://localhost:3030/#/v2/post/1', type: 'string' },
  });
});

test('Captures a parameterized path pageload span for nested route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-hash-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/#/v2/post/1/featured');

  const span = await spanPromise;

  expect(span.name).toBe('/v2/post/:post/featured');
  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/v2/post/:post/featured', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: 'http://localhost:3030/#/v2/post/1/featured', type: 'string' },
  });
});

test('Captures a parameterized path pageload span for deeply nested route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-hash-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/#/v1/post/1/edit');

  const span = await spanPromise;

  expect(span.name).toBe('/v1/post/:post/edit');
  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/v1/post/:post/edit', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: 'http://localhost:3030/#/v1/post/1/edit', type: 'string' },
  });
});

test('Captures a parameterized path pageload span for nested route with absolute path', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-hash-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/#/v2/post/1/related');

  const span = await spanPromise;

  expect(span.name).toBe('/v2/post/:post/related');
  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/v2/post/:post/related', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: 'http://localhost:3030/#/v2/post/1/related', type: 'string' },
  });
});

test('Captures a parameterized path navigation span', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-hash-router', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto('/');
  const linkElement = page.locator('id=navigation-post-1');
  await linkElement.click();

  const span = await spanPromise;

  expect(span.name).toBe('/v2/post/:post');
  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/v2/post/:post', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: 'http://localhost:3030/#/v2/post/1', type: 'string' },
  });
});

test('Captures a parameterized path navigation span for nested route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-hash-router', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto('/');
  const linkElement = page.locator('id=navigation-post-1-featured');
  await linkElement.click();

  const span = await spanPromise;

  expect(span.name).toBe('/v2/post/:post/featured');
  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/v2/post/:post/featured', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: 'http://localhost:3030/#/v2/post/1/featured', type: 'string' },
  });
});

test('Captures a parameterized path navigation span for deeply nested route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-hash-router', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto('/');
  const linkElement = page.locator('id=navigation-post-1-edit');
  await linkElement.click();

  const span = await spanPromise;

  expect(span.name).toBe('/v1/post/:post/edit');
  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/v1/post/:post/edit', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: 'http://localhost:3030/#/v1/post/1/edit', type: 'string' },
  });
});

test('Captures a parameterized path navigation span for nested route with absolute path', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-hash-router', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto('/');
  const linkElement = page.locator('id=navigation-post-1-related');
  await linkElement.click();

  const span = await spanPromise;

  expect(span.name).toBe('/v2/post/:post/related');
  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/v2/post/:post/related', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: 'http://localhost:3030/#/v2/post/1/related', type: 'string' },
  });
});

test('Captures a parameterized path pageload span for group route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-hash-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/#/group/1');

  const span = await spanPromise;

  expect(span.name).toBe('/group/:group/:user?');
  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/group/:group/:user?', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: 'http://localhost:3030/#/group/1', type: 'string' },
  });
});

test('Captures a parameterized path navigation span for group route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-hash-router', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto('/');
  const linkElement = page.locator('id=navigation-group-1');
  await linkElement.click();

  const span = await spanPromise;

  expect(span.name).toBe('/group/:group/:user?');
  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/group/:group/:user?', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: 'http://localhost:3030/#/group/1', type: 'string' },
  });
});

test('Captures a parameterized path pageload span for nested group route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-hash-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/#/group/1/5');

  const span = await spanPromise;

  expect(span.name).toBe('/group/:group/:user?');
  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/group/:group/:user?', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: 'http://localhost:3030/#/group/1/5', type: 'string' },
  });
});

test('Captures a parameterized path navigation span for nested group route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-hash-router', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto('/');
  const linkElement = page.locator('id=navigation-group-1-user-5');
  await linkElement.click();

  const span = await spanPromise;

  expect(span.name).toBe('/group/:group/:user?');
  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/group/:group/:user?', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: 'http://localhost:3030/#/group/1/5', type: 'string' },
  });
});
