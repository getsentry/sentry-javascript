import {
  BROWSER_SCRIPT_INVOKER,
  CODE_FILE_PATH,
  BROWSER_SCRIPT_SOURCE_CHAR_POSITION,
  BROWSER_SCRIPT_INVOKER_TYPE,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'captures long animation frame span for top-level script.',
  async ({ browserName, getLocalTestUrl, page }) => {
    // Long animation frames only work on chrome
    sentryTest.skip(shouldSkipTracingTest() || browserName !== 'chromium');

    // Long animation frame should take priority over long tasks

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spans = collectStreamedSpans(page);
    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

    await page.goto(url);

    await pageloadSpanPromise;
    await page.evaluate(() => (window as any).Sentry.flush());
    const pageloadSpan = spans.find(s => getSpanOp(s) === 'pageload')!;

    const uiSpans = spans.filter(s => getSpanOp(s)?.startsWith('ui.long_animation_frame'));

    expect(uiSpans.length).toBeGreaterThanOrEqual(1);

    const topLevelUISpan = uiSpans.find(
      s => s.attributes[BROWSER_SCRIPT_INVOKER]?.value === 'https://sentry-test-site.example/path/to/script.js',
    )!;

    expect(topLevelUISpan).toEqual(
      expect.objectContaining({
        name: 'Main UI thread blocked',
        parent_span_id: pageloadSpan.span_id,
        attributes: expect.objectContaining({
          [CODE_FILE_PATH]: { type: 'string', value: 'https://sentry-test-site.example/path/to/script.js' },
          [BROWSER_SCRIPT_SOURCE_CHAR_POSITION]: expect.objectContaining({ value: 0 }),
          [BROWSER_SCRIPT_INVOKER]: {
            type: 'string',
            value: 'https://sentry-test-site.example/path/to/script.js',
          },
          [BROWSER_SCRIPT_INVOKER_TYPE]: { type: 'string', value: 'classic-script' },
          [SENTRY_OP]: { type: 'string', value: 'ui.long_animation_frame' },
          [SENTRY_ORIGIN]: { type: 'string', value: 'auto.ui.browser.metrics' },
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
  sentryTest.skip(shouldSkipTracingTest() || browserName !== 'chromium');

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spans = collectStreamedSpans(page);
  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

  await page.goto(url);

  // trigger long animation frame function
  await page.getByRole('button').click();

  const pageloadSpan = await pageloadSpanPromise;
  await page.evaluate(() => (window as any).Sentry.flush());

  const uiSpans = spans.filter(s => getSpanOp(s)?.startsWith('ui.long_animation_frame'));

  expect(uiSpans.length).toBeGreaterThanOrEqual(2);

  const eventListenerUISpan = uiSpans.find(
    s => s.attributes[BROWSER_SCRIPT_INVOKER]?.value === 'BUTTON#clickme.onclick',
  )!;

  expect(eventListenerUISpan).toEqual(
    expect.objectContaining({
      name: 'Main UI thread blocked',
      parent_span_id: pageloadSpan.span_id,
      attributes: expect.objectContaining({
        [BROWSER_SCRIPT_INVOKER]: { type: 'string', value: 'BUTTON#clickme.onclick' },
        [BROWSER_SCRIPT_INVOKER_TYPE]: { type: 'string', value: 'event-listener' },
        [CODE_FILE_PATH]: { type: 'string', value: 'https://sentry-test-site.example/path/to/script.js' },
        [SENTRY_OP]: { type: 'string', value: 'ui.long_animation_frame' },
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.ui.browser.metrics' },
      }),
    }),
  );

  const start = eventListenerUISpan.start_timestamp ?? 0;
  const end = eventListenerUISpan.end_timestamp ?? 0;
  const duration = end - start;

  expect(duration).toBeGreaterThanOrEqual(0.1);
  expect(duration).toBeLessThanOrEqual(0.15);
});
