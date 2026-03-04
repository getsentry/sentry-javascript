import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/browser';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest(
  'captures long animation frame span for top-level script.',
  async ({ browserName, getLocalTestUrl, page }) => {
    // Long animation frames only work on chrome
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spansPromise = waitForStreamedSpans(page, spans => spans.some(s => getSpanOp(s) === 'pageload'));

    await page.goto(url);

    const spans = await spansPromise;
    const pageloadSpan = spans.find(s => getSpanOp(s) === 'pageload')!;

    const uiSpans = spans.filter(s => getSpanOp(s)?.startsWith('ui.long-animation-frame'));

    expect(uiSpans.length).toBeGreaterThanOrEqual(1);

    const topLevelUISpan = uiSpans.find(
      s => s.attributes?.['browser.script.invoker']?.value === 'https://sentry-test-site.example/path/to/script.js',
    )!;

    expect(topLevelUISpan).toEqual(
      expect.objectContaining({
        name: 'Main UI thread blocked',
        parent_span_id: pageloadSpan.span_id,
        attributes: expect.objectContaining({
          'code.filepath': { type: 'string', value: 'https://sentry-test-site.example/path/to/script.js' },
          'browser.script.source_char_position': expect.objectContaining({ value: 0 }),
          'browser.script.invoker': {
            type: 'string',
            value: 'https://sentry-test-site.example/path/to/script.js',
          },
          'browser.script.invoker_type': { type: 'string', value: 'classic-script' },
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'ui.long-animation-frame' },
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.ui.browser.metrics' },
        }),
      }),
    );

    const start = topLevelUISpan.start_timestamp ?? 0;
    const end = topLevelUISpan.end_timestamp ?? 0;
    const duration = end - start;

    expect(duration).toBeGreaterThanOrEqual(0.1);
    expect(duration).toBeLessThanOrEqual(0.15);
  },
);

sentryTest('captures long animation frame span for event listener.', async ({ browserName, getLocalTestUrl, page }) => {
  // Long animation frames only work on chrome
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spansPromise = waitForStreamedSpans(page, spans => spans.some(s => getSpanOp(s) === 'pageload'));

  await page.goto(url);

  // trigger long animation frame function
  await page.getByRole('button').click();

  const spans = await spansPromise;
  const pageloadSpan = spans.find(s => getSpanOp(s) === 'pageload')!;

  const uiSpans = spans.filter(s => getSpanOp(s)?.startsWith('ui.long-animation-frame'));

  expect(uiSpans.length).toBeGreaterThanOrEqual(2);

  const eventListenerUISpan = uiSpans.find(
    s => s.attributes?.['browser.script.invoker']?.value === 'BUTTON#clickme.onclick',
  )!;

  expect(eventListenerUISpan).toEqual(
    expect.objectContaining({
      name: 'Main UI thread blocked',
      parent_span_id: pageloadSpan.span_id,
      attributes: expect.objectContaining({
        'browser.script.invoker': { type: 'string', value: 'BUTTON#clickme.onclick' },
        'browser.script.invoker_type': { type: 'string', value: 'event-listener' },
        'code.filepath': { type: 'string', value: 'https://sentry-test-site.example/path/to/script.js' },
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'ui.long-animation-frame' },
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.ui.browser.metrics' },
      }),
    }),
  );

  const start = eventListenerUISpan.start_timestamp ?? 0;
  const end = eventListenerUISpan.end_timestamp ?? 0;
  const duration = end - start;

  expect(duration).toBeGreaterThanOrEqual(0.1);
  expect(duration).toBeLessThanOrEqual(0.15);
});
