import { PAGELOAD, UI_LONG_ANIMATION_FRAME } from '@sentry/conventions/op';
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
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest(
  'should capture long animation frame for top-level script.',
  async ({ browserName, getLocalTestUrl, page }) => {
    // Long animation frames only work on chrome
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    // Long animation frame should take priority over long tasks

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });

    const promise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === PAGELOAD);

    await page.goto(url);

    const eventData = envelopeRequestParser(await promise);

    const uiSpans = eventData.spans?.filter(({ op }) => op?.startsWith(UI_LONG_ANIMATION_FRAME));

    expect(uiSpans?.length).toBeGreaterThanOrEqual(1);

    const topLevelUISpan = (uiSpans || []).find(
      span => span.data?.[BROWSER_SCRIPT_INVOKER] === 'https://sentry-test-site.example/path/to/script.js',
    )!;
    expect(topLevelUISpan).toEqual(
      expect.objectContaining({
        op: UI_LONG_ANIMATION_FRAME,
        description: 'Main UI thread blocked',
        parent_span_id: eventData.contexts?.trace?.span_id,
        data: {
          [CODE_FILE_PATH]: 'https://sentry-test-site.example/path/to/script.js',
          [BROWSER_SCRIPT_SOURCE_CHAR_POSITION]: 0,
          [BROWSER_SCRIPT_INVOKER]: 'https://sentry-test-site.example/path/to/script.js',
          [BROWSER_SCRIPT_INVOKER_TYPE]: 'classic-script',
          [SENTRY_OP]: UI_LONG_ANIMATION_FRAME,
          [SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
        },
      }),
    );
    const start = topLevelUISpan.start_timestamp ?? 0;
    const end = topLevelUISpan.timestamp ?? 0;
    const duration = end - start;

    expect(duration).toBeGreaterThanOrEqual(0.1);
    expect(duration).toBeLessThanOrEqual(0.15);
  },
);

sentryTest(
  'should capture long animation frame for event listener.',
  async ({ browserName, getLocalTestUrl, page }) => {
    // Long animation frames only work on chrome
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });

    const promise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === PAGELOAD);

    await page.goto(url);

    // trigger long animation frame function
    await page.getByRole('button').click();

    const eventData = envelopeRequestParser(await promise);

    const uiSpans = eventData.spans?.filter(({ op }) => op?.startsWith(UI_LONG_ANIMATION_FRAME)) || [];

    expect(uiSpans.length).toBeGreaterThanOrEqual(2);

    const eventListenerUISpan = uiSpans.find(span => span.data[BROWSER_SCRIPT_INVOKER] === 'BUTTON#clickme.onclick')!;

    expect(eventListenerUISpan).toEqual(
      expect.objectContaining({
        op: UI_LONG_ANIMATION_FRAME,
        description: 'Main UI thread blocked',
        parent_span_id: eventData.contexts?.trace?.span_id,
        data: {
          [BROWSER_SCRIPT_INVOKER]: 'BUTTON#clickme.onclick',
          [BROWSER_SCRIPT_INVOKER_TYPE]: 'event-listener',
          [CODE_FILE_PATH]: 'https://sentry-test-site.example/path/to/script.js',
          [SENTRY_OP]: UI_LONG_ANIMATION_FRAME,
          [SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
        },
      }),
    );
    const start = eventListenerUISpan.start_timestamp ?? 0;
    const end = eventListenerUISpan.timestamp ?? 0;
    const duration = end - start;

    expect(duration).toBeGreaterThanOrEqual(0.1);
    expect(duration).toBeLessThanOrEqual(0.15);
  },
);
