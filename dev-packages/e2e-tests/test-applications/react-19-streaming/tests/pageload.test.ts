import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';

test('Sends a streamed pageload span with correct attributes', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-19-streaming', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/');

  const span = await spanPromise;

  expect(span.name).toBe('/');
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.span_id).toMatch(/[a-f0-9]{16}/);
  expect(span.is_segment).toBe(true);
  expect(span.status).toBe('ok');
  expect(span.start_timestamp).toBeGreaterThan(0);
  expect(span.end_timestamp).toBeGreaterThanOrEqual(span.start_timestamp);

  expect(span.attributes?.['sentry.op']?.value).toBe('pageload');
  expect(span.attributes?.['sentry.origin']?.value).toBe('auto.pageload.browser');
  expect(span.attributes?.['sentry.source']?.value).toBe('url');
  expect(span.attributes?.['sentry.idle_span_finish_reason']?.value).toEqual(expect.any(String));
});

test('Pageload span includes child spans', async ({ page }) => {
  const spansPromise = waitForStreamedSpans('react-19-streaming', spans => {
    return spans.some(span => getSpanOp(span) === 'pageload' && span.is_segment);
  });

  await page.goto('/');

  const spans = await spansPromise;

  const pageloadSpan = spans.find(span => getSpanOp(span) === 'pageload' && span.is_segment);
  expect(pageloadSpan).toBeDefined();

  const childSpans = spans.filter(span => !span.is_segment);
  expect(childSpans.length).toBeGreaterThan(0);

  for (const child of childSpans) {
    expect(child.trace_id).toBe(pageloadSpan!.trace_id);
  }
});
