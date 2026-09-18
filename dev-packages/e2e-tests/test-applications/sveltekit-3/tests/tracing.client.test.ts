import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { waitForInitialPageload } from './utils';

test.describe('client-specific performance events', () => {
  test('multiple navigations have distinct traces', async ({ page }) => {
    const navigationSpan1Promise = waitForStreamedSpan('sveltekit-3', span => {
      return span.name === '/nav1' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    const navigationSpan2Promise = waitForStreamedSpan('sveltekit-3', span => {
      return span.name === '/' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    const navigationSpan3Promise = waitForStreamedSpan('sveltekit-3', span => {
      return span.name === '/nav2' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    await waitForInitialPageload(page);

    await page.getByText('Nav 1').click();
    const navigationSpan1 = await navigationSpan1Promise;

    await page.goBack();
    const navigationSpan2 = await navigationSpan2Promise;

    await page.getByText('Nav 2').click();
    const navigationSpan3 = await navigationSpan3Promise;

    const expectNavigationSpan = (span: typeof navigationSpan1, route: string) => {
      expect(span.name).toBe(route);
      expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
      expect(span.attributes).toMatchObject({
        'sentry.op': { value: 'navigation', type: 'string' },
        'sentry.origin': { value: 'auto.navigation.sveltekit', type: 'string' },
        'sentry.segment.name.source': { value: 'route', type: 'string' },
      });
    };

    expectNavigationSpan(navigationSpan1, '/nav1');
    expectNavigationSpan(navigationSpan2, '/');
    expectNavigationSpan(navigationSpan3, '/nav2');

    // traces should NOT be connected
    expect(navigationSpan1.trace_id).not.toBe(navigationSpan2.trace_id);
    expect(navigationSpan2.trace_id).not.toBe(navigationSpan3.trace_id);
    expect(navigationSpan1.trace_id).not.toBe(navigationSpan3.trace_id);
  });

  test('records manually added component tracking spans', async ({ page }) => {
    const componentTraceSpansPromise = collectStreamedSpansUntilSegment('sveltekit-3', '/components');

    await waitForInitialPageload(page);

    await page.getByText('Component Tracking').click();

    const componentTraceSpans = await componentTraceSpansPromise;

    const componentSpan = (name: string) =>
      expect.objectContaining({
        name,
        attributes: expect.objectContaining({
          'sentry.op': { value: 'ui.mount', type: 'string' },
          'sentry.origin': { value: 'auto.ui.svelte', type: 'string' },
        }),
      });

    expect(componentTraceSpans).toEqual(
      expect.arrayContaining([
        componentSpan('<components/+page>'),
        componentSpan('<Component1>'),
        componentSpan('<Component2>'),
        componentSpan('<Component3>'),
      ]),
    );
  });
});
