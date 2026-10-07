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
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'should capture long animation frame for top-level script.',
  async ({ browserName, getLocalTestUrl, page }) => {
    // Long animation frames only work on chrome
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });

    const promise = getFirstSentryEnvelopeRequest<Event>(page);

    await page.goto(url);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const eventData = await promise;

    const uiSpans = eventData.spans?.filter(({ op }) => op?.startsWith('ui.long_animation_frame'));

    expect(uiSpans?.length).toBeGreaterThanOrEqual(1);

    const topLevelUISpan = (uiSpans || []).find(
      span => span.data?.[BROWSER_SCRIPT_INVOKER] === 'https://sentry-test-site.example/path/to/script.js',
    )!;
    expect(topLevelUISpan).toEqual(
      expect.objectContaining({
        op: 'ui.long_animation_frame',
        description: 'Main UI thread blocked',
        parent_span_id: eventData.contexts?.trace?.span_id,
        data: {
          [CODE_FILE_PATH]: 'https://sentry-test-site.example/path/to/script.js',
          [BROWSER_SCRIPT_SOURCE_CHAR_POSITION]: 0,
          [BROWSER_SCRIPT_INVOKER]: 'https://sentry-test-site.example/path/to/script.js',
          [BROWSER_SCRIPT_INVOKER_TYPE]: 'classic-script',
          [SENTRY_OP]: 'ui.long_animation_frame',
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

    const promise = getFirstSentryEnvelopeRequest<Event>(page);

    await page.goto(url);

    // trigger long animation frame function
    await page.getByRole('button').click();

    await new Promise(resolve => setTimeout(resolve, 1000));

    const eventData = await promise;

    const uiSpans = eventData.spans?.filter(({ op }) => op?.startsWith('ui.long_animation_frame')) || [];

    expect(uiSpans.length).toBeGreaterThanOrEqual(2);

    const eventListenerUISpan = uiSpans.find(span => span.data[BROWSER_SCRIPT_INVOKER] === 'BUTTON#clickme.onclick')!;

    expect(eventListenerUISpan).toEqual(
      expect.objectContaining({
        op: 'ui.long_animation_frame',
        description: 'Main UI thread blocked',
        parent_span_id: eventData.contexts?.trace?.span_id,
        data: {
          [BROWSER_SCRIPT_INVOKER]: 'BUTTON#clickme.onclick',
          [BROWSER_SCRIPT_INVOKER_TYPE]: 'event-listener',
          [CODE_FILE_PATH]: 'https://sentry-test-site.example/path/to/script.js',
          [SENTRY_OP]: 'ui.long_animation_frame',
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
