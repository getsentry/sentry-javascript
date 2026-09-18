import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';

test('sends a pageload span with component tracking init spans', async ({ page }) => {
  const spansPromise = collectStreamedSpansUntilSegment('svelte-5', span => getSpanOp(span) === 'pageload');

  await page.goto(`/`);

  const spans = await spansPromise;
  const pageloadSpan = spans.find(span => getSpanOp(span) === 'pageload' && span.is_segment);

  expect(pageloadSpan?.name).toBe('Pageload');
  expect(pageloadSpan?.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.browser', type: 'string' },
    'sentry.segment.name.source': { value: 'url', type: 'string' },
    'url.path': { value: '/', type: 'string' },
  });

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: '<App>',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'ui.mount', type: 'string' },
          'sentry.origin': { value: 'auto.ui.svelte', type: 'string' },
        }),
      }),
      expect.objectContaining({
        name: '<Counter>',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'ui.mount', type: 'string' },
          'sentry.origin': { value: 'auto.ui.svelte', type: 'string' },
        }),
      }),
    ]),
  );
});
