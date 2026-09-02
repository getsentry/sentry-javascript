import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { waitForInitialPageload } from './utils';

test.describe('client-specific performance events', () => {
  test('multiple navigations have distinct traces', async ({ page }) => {
    const navigationSpan1Promise = waitForStreamedSpan('sveltekit-2', span => {
      return span.name === '/nav1' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    const navigationSpan2Promise = waitForStreamedSpan('sveltekit-2', span => {
      return span.name === '/' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    const navigationSpan3Promise = waitForStreamedSpan('sveltekit-2', span => {
      return span.name === '/nav2' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    await waitForInitialPageload(page);

    const [navigationSpan1] = await Promise.all([navigationSpan1Promise, page.getByText('Nav 1').click()]);
    const [navigationSpan2] = await Promise.all([navigationSpan2Promise, page.goBack()]);
    const [navigationSpan3] = await Promise.all([navigationSpan3Promise, page.getByText('Nav 2').click()]);

    const expectNavigationSpan = (span: typeof navigationSpan1, route: string) => {
      expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
      expect(span.attributes).toMatchObject({
        'sentry.op': { value: 'navigation', type: 'string' },
        'sentry.origin': { value: 'auto.navigation.sveltekit', type: 'string' },
        'sentry.segment.name.source': { value: 'route', type: 'string' },
        'url.path': { value: route, type: 'string' },
        'url.full': {
          value: expect.stringMatching(new RegExp(`^https?:\\/\\/localhost:\\d+${route}$`)),
          type: 'string',
        },
        'url.template': { value: route, type: 'string' },
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
    const componentTraceSpansPromise = collectStreamedSpans('sveltekit-2', spansOfTrace =>
      spansOfTrace.some(span => span.name === '/components' && span.is_segment),
    );

    await waitForInitialPageload(page);

    await page.getByText('Component Tracking').click();

    const componentTraceSpans = await componentTraceSpansPromise;

    const componentSpan = (op: 'ui.mount' | 'ui.update', name: string) =>
      expect.objectContaining({
        name,
        attributes: expect.objectContaining({
          'sentry.op': { value: op, type: 'string' },
          'sentry.origin': { value: 'auto.ui.svelte', type: 'string' },
        }),
      });

    expect(componentTraceSpans).toEqual(
      expect.arrayContaining([
        componentSpan('ui.mount', '<components/+page>'),
        componentSpan('ui.mount', '<Component1>'),
        componentSpan('ui.mount', '<Component2>'),
        componentSpan('ui.mount', '<Component3>'),
        componentSpan('ui.update', '<components/+page>'),
        componentSpan('ui.update', '<Component1>'),
        componentSpan('ui.update', '<Component2>'),
        componentSpan('ui.update', '<Component3>'),
      ]),
    );
  });
});
