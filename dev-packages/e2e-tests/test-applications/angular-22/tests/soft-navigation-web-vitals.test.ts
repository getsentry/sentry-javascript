import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, hidePage } from '@sentry-internal/test-utils';

// The correlation between a soft navigation and the SDK's navigation span hangs off the interaction
// that triggered it, so it only holds while the navigation span is started before the interaction's
// Event Timing entry is delivered. Angular's router instrumentation starts the navigation span off the router's own event stream.
test('attributes soft navigation web vitals to the navigation span they were measured on', async ({ page }) => {
  const spansPromise = collectStreamedSpans(
    'angular-22',
    spansOfTrace =>
      spansOfTrace.some(span => getSpanOp(span) === 'navigation' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'ui.webvital.cls'),
  );

  await page.goto('/');
  await page.locator('#navLink').click();

  // A soft navigation's vitals are finalized at the next soft navigation or on pagehide, so nothing
  // is reported for it until the page goes away.
  await hidePage(page);

  const spans = await spansPromise;

  const navigationSpan = spans.find(span => getSpanOp(span) === 'navigation' && span.is_segment)!;
  const clsSpan = spans.find(span => getSpanOp(span) === 'ui.webvital.cls')!;

  expect(navigationSpan.name).toBe('/users/:id/');

  const softNavigationId = navigationSpan.attributes['browser.navigation.id']?.value;
  expect(softNavigationId).toEqual(expect.any(Number));

  // Both sides of the correlation carry the id, so the navigation and its vitals are joinable.
  expect(clsSpan.attributes).toMatchObject({
    'browser.navigation.id': { value: softNavigationId, type: 'integer' },
    'browser.navigation.type': { value: 'soft-navigation', type: 'string' },
  });
  expect(clsSpan.parent_span_id).toBe(navigationSpan.span_id);
});
