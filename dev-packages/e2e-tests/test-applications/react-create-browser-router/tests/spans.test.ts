import { expect, test } from '@playwright/test';
import {
  collectStreamedSpans,
  getSpanOp,
  waitForStreamedSpan,
  waitForStreamedSpans,
} from '@sentry-internal/test-utils';

const PREVIOUS_TRACE_LINK = [
  {
    attributes: {
      'sentry.link.type': { value: 'previous_trace', type: 'string' },
    },
    sampled: true,
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  },
];

test('Captures a pageload span', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-browser-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/');

  const span = await spanPromise;

  expect(span.name).toBe('/');
  expect(span.status).toBe('ok');
  expect(span.span_id).toMatch(/[a-f0-9]{16}/);
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);

  expect(span.attributes).toMatchObject({
    'device.memory.estimated_capacity': { value: expect.any(Number), type: expect.any(String) },
    'device.processor_count': { value: expect.any(Number), type: 'integer' },
    'network.connection.effective_type': { value: expect.any(String), type: 'string' },
    'sentry.idle_span_finish_reason': { value: 'idleTimeout', type: 'string' },
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter_v6', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/), type: 'string' },
  });
});

test('Captures a navigation span', async ({ page }) => {
  const spansPromise = waitForStreamedSpans('react-create-browser-router', spans => {
    return spans.some(span => getSpanOp(span) === 'navigation' && span.is_segment);
  });

  await page.goto('/');
  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const spans = await spansPromise;
  const navigationSpan = spans.find(span => span.is_segment)!;

  expect(navigationSpan.name).toBe('/user/:id');
  expect(navigationSpan.status).toBe('ok');
  expect(navigationSpan.span_id).toMatch(/[a-f0-9]{16}/);
  expect(navigationSpan.trace_id).toMatch(/[a-f0-9]{32}/);

  expect(navigationSpan.attributes).toMatchObject({
    'sentry.idle_span_finish_reason': { value: 'idleTimeout', type: 'string' },
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.react.reactrouter_v6', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/user/:id', type: 'string' },
    'url.path': { value: '/user/5', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/user\/5$/), type: 'string' },
  });

  expect(navigationSpan.links).toEqual(PREVIOUS_TRACE_LINK);

  // Filter out favicon spans which may or may not be present depending on the browser version
  const childSpans = spans.filter(
    span => !span.is_segment && !(span.attributes['url.full']?.value as string | undefined)?.includes('favicon'),
  );
  expect(childSpans).toEqual([]);
});

test('Captures a lazy pageload span', async ({ page }) => {
  const spansPromise = collectStreamedSpans('react-create-browser-router', spans => {
    return spans.some(span => getSpanOp(span) === 'pageload' && span.is_segment);
  });

  await page.goto('/lazy-loaded-user/5/foo');

  const spans = await spansPromise;
  const pageloadSpan = spans.find(span => getSpanOp(span) === 'pageload' && span.is_segment)!;

  expect(pageloadSpan.name).toBe('/lazy-loaded-user/:id/:innerId');
  expect(pageloadSpan.status).toBe('ok');

  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.idle_span_finish_reason': { value: 'idleTimeout', type: 'string' },
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter_v6', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/lazy-loaded-user/:id/:innerId', type: 'string' },
    'url.path': { value: '/lazy-loaded-user/5/foo', type: 'string' },
    'url.full': {
      value: expect.stringMatching(/^https?:\/\/localhost:\d+\/lazy-loaded-user\/5\/foo$/),
      type: 'string',
    },
  });

  expect(await page.innerText('id=content')).toContain('I am a lazy loaded user');

  // One span for the outer lazy route, one for the inner one
  const resourceSpans = spans.filter(
    span =>
      getSpanOp(span) === 'resource.script' &&
      span.attributes['sentry.origin']?.value === 'auto.resource.browser.metrics',
  );
  expect(resourceSpans.length).toBeGreaterThanOrEqual(2);
});

test('Captures a lazy navigation span', async ({ page }) => {
  const spansPromise = collectStreamedSpans('react-create-browser-router', spans => {
    return spans.some(span => getSpanOp(span) === 'navigation' && span.is_segment);
  });

  await page.goto('/');
  const linkElement = page.locator('id=lazy-navigation');
  await linkElement.click();

  const spans = await spansPromise;
  const navigationSpan = spans.find(span => getSpanOp(span) === 'navigation' && span.is_segment)!;

  expect(navigationSpan.name).toBe('/lazy-loaded-user/:id/:innerId');
  expect(navigationSpan.status).toBe('ok');

  expect(navigationSpan.attributes).toMatchObject({
    'sentry.idle_span_finish_reason': { value: 'idleTimeout', type: 'string' },
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.react.reactrouter_v6', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/lazy-loaded-user/:id/:innerId', type: 'string' },
    'url.path': { value: '/lazy-loaded-user/5/foo', type: 'string' },
    'url.full': {
      value: expect.stringMatching(/^https?:\/\/localhost:\d+\/lazy-loaded-user\/5\/foo$/),
      type: 'string',
    },
  });

  expect(navigationSpan.links).toEqual(PREVIOUS_TRACE_LINK);

  expect(await page.innerText('id=content')).toContain('I am a lazy loaded user');

  // One span for the outer lazy route, one for the inner one
  const resourceSpans = spans.filter(
    span =>
      getSpanOp(span) === 'resource.script' &&
      span.attributes['sentry.origin']?.value === 'auto.resource.browser.metrics',
  );
  expect(resourceSpans.length).toBeGreaterThanOrEqual(2);
});
