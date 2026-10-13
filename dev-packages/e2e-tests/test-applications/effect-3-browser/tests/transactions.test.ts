import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('captures a pageload span', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('effect-3-browser', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/');

  const span = await spanPromise;

  expect(span.name).toBe('Pageload');
  expect(span.status).toBe('ok');
  expect(span.span_id).toMatch(/[a-f0-9]{16}/);
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.attributes).toMatchObject({
    'sentry.idle_span_finish_reason': { value: 'idleTimeout', type: 'string' },
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.browser', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'url', type: 'string' },
  });
});

test('captures a navigation span', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('effect-3-browser', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('effect-3-browser', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto('/');
  await pageloadSpanPromise;

  const linkElement = page.locator('id=navigation-link');
  await linkElement.click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan.name).toBe('Navigation');
  expect(navigationSpan.status).toBe('ok');
  expect(navigationSpan.span_id).toMatch(/[a-f0-9]{16}/);
  expect(navigationSpan.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.browser', type: 'string' },
    'sentry.segment.name.source': { value: 'url', type: 'string' },
  });
});

test('captures Effect spans with correct parent-child structure', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('effect-3-browser', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const spansPromise = collectStreamedSpans('effect-3-browser', spans => {
    return spans.some(span => span.name === 'custom-effect-span') && spans.some(span => span.name === 'nested-span');
  });

  await page.goto('/');
  await pageloadSpanPromise;

  const effectSpanButton = page.locator('id=effect-span-button');
  await effectSpanButton.click();

  await expect(page.locator('id=effect-span-result')).toHaveText('Span sent!');

  const spans = await spansPromise;

  const parentSpan = spans.find(span => span.name === 'custom-effect-span');
  const nestedSpan = spans.find(span => span.name === 'nested-span');
  expect(parentSpan).toBeDefined();
  expect(nestedSpan).toBeDefined();
  expect(nestedSpan?.parent_span_id).toBe(parentSpan?.span_id);
});
