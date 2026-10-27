import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should capture long task.', async ({ browserName, getLocalTestUrl, page }) => {
  // Long tasks only work on chrome
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const uiSpans = eventData.spans?.filter(({ op }) => op?.startsWith('ui'));

  expect(uiSpans?.length).toBeGreaterThan(0);

  const getDuration = (span: { start_timestamp?: number; timestamp?: number }): number =>
    (span.timestamp ?? 0) - (span.start_timestamp ?? 0);
  // Other long tasks (e.g. SDK evaluation) can happen during pageload, so look at the longest one, which is the blocking script
  const [longTaskSpan] = [...(uiSpans || [])].sort((a, b) => getDuration(b) - getDuration(a));
  expect(longTaskSpan).toEqual(
    expect.objectContaining({
      op: 'ui.long_task',
      description: 'Main UI thread blocked',
      parent_span_id: eventData.contexts?.trace?.span_id,
    }),
  );
  const duration = getDuration(longTaskSpan);

  expect(duration).toBeGreaterThanOrEqual(0.1);
  expect(duration).toBeLessThan(1);
});
