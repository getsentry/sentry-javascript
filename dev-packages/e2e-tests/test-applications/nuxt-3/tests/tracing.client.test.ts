import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload root span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('nuxt-3', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/test-param/1234`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.name).toBe('/test-param/:param()');
  expect(pageloadSpan.status).toBe('ok');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.segment.name.source': { type: 'string', value: 'route' },
    'sentry.origin': { type: 'string', value: 'auto.pageload.vue' },
    'sentry.op': { type: 'string', value: 'pageload' },
    'params.param': { type: 'string', value: '1234' },
    'url.template': { type: 'string', value: '/test-param/:param()' },
    'url.path': { type: 'string', value: '/test-param/1234' },
    'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/test-param\/1234$/) },
  });
});

test('sends component tracking spans when `trackComponents` is enabled', async ({ page }) => {
  const spansPromise = collectStreamedSpans('nuxt-3', spans =>
    spans.some(span => span.name === '/client-error' && span.is_segment && getSpanOp(span) === 'pageload'),
  );

  await page.goto(`/client-error`);

  const spans = await spansPromise;
  const errorButtonSpan = spans.find(span => span.name === 'Vue <ErrorButton>');

  expect(errorButtonSpan).toMatchObject({
    name: 'Vue <ErrorButton>',
    is_segment: false,
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.mount' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
    }),
  });
});
