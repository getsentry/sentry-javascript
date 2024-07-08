import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/browser';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'should capture long animation frame for top-level script.',
  async ({ browserName, getLocalTestPath, page }) => {
    // Long animation frames only work on chrome
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestPath({ testDir: __dirname });

    const promise = getFirstSentryEnvelopeRequest<Event>(page);

    await page.goto(url);

    const eventData = await promise;

    const uiSpans = eventData.spans?.filter(({ op }) => op?.startsWith('ui.long-animation-frame'));

    expect(uiSpans?.length).toEqual(1);

    const [topLevelUISpan] = uiSpans || [];
    expect(topLevelUISpan).toEqual(
      expect.objectContaining({
        op: 'ui.long-animation-frame',
        description: 'Main UI thread blocked',
        parent_span_id: eventData.contexts?.trace?.span_id,
        data: {
          'code.filepath': 'https://example.com/path/to/script.js',
          'browser.script.source_char_position': 0,
          'browser.script.invoker': 'https://example.com/path/to/script.js',
          'browser.script.invoker_type': 'classic-script',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.long-animation-frame',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
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
  async ({ browserName, getLocalTestPath, page }) => {
    // Long animation frames only work on chrome
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestPath({ testDir: __dirname });

    const promise = getFirstSentryEnvelopeRequest<Event>(page);

    await page.goto(url);

    // trigger long animation frame function
    await page.getByRole('button').click();

    const eventData = await promise;

    const uiSpans = eventData.spans?.filter(({ op }) => op?.startsWith('ui.long-animation-frame'));

    expect(uiSpans?.length).toEqual(2);

    // ignore the first ui span (top-level long animation frame)
    const [, eventListenerUISpan] = uiSpans || [];

    expect(eventListenerUISpan).toEqual(
      expect.objectContaining({
        op: 'ui.long-animation-frame',
        description: 'Main UI thread blocked',
        parent_span_id: eventData.contexts?.trace?.span_id,
        data: {
          'browser.script.invoker': 'BUTTON#clickme.onclick',
          'browser.script.invoker_type': 'event-listener',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.long-animation-frame',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
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
