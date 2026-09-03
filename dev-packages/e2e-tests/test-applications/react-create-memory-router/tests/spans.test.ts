import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';

test('Captures a pageload span', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-create-memory-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/');

  const span = await spanPromise;

  expect(span.name).toBe('/user/:id');
  expect(span.status).toBe('ok');
  expect(span.span_id).toMatch(/[a-f0-9]{16}/);
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);

  expect(span.attributes).toMatchObject({
    'sentry.idle_span_finish_reason': { value: 'idleTimeout', type: 'string' },
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter_v6', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/user/:id', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/), type: 'string' },
  });
});

test('Captures a navigation span', async ({ page }) => {
  const spansPromise = waitForStreamedSpans('react-create-memory-router', spans => {
    return spans.some(span => getSpanOp(span) === 'navigation' && span.is_segment);
  });

  await page.goto('/');
  const linkElement = page.locator('id=navigation-button');
  await linkElement.click();

  const spans = await spansPromise;
  const span = spans.find(span => span.is_segment)!;

  expect(span.name).toBe('/user/:id');
  expect(span.status).toBe('ok');
  expect(span.span_id).toMatch(/[a-f0-9]{16}/);
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);

  expect(span.attributes).toMatchObject({
    'sentry.idle_span_finish_reason': { value: 'idleTimeout', type: 'string' },
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.react.reactrouter_v6', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/user/:id', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/), type: 'string' },
  });

  expect(span.links).toEqual([
    {
      attributes: {
        'sentry.link.type': { value: 'previous_trace', type: 'string' },
      },
      sampled: true,
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    },
  ]);

  expect(spans.filter(span => !span.is_segment)).toEqual([]);
});
