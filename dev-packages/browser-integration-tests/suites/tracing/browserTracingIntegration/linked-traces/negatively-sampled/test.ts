import { SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest('includes a span link to a previously negatively sampled span', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  await sentryTest.step('Initial pageload', async () => {
    // No span envelope expected here because this pageload span is sampled negatively!
    await page.goto(url);
  });

  await sentryTest.step('Navigation', async () => {
    const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');
    await page.goto(`${url}#foo`);
    const navigationSpan = await navigationSpanPromise;

    expect(getSpanOp(navigationSpan)).toBe('navigation');
    expect(navigationSpan.links).toEqual([
      {
        trace_id: expect.stringMatching(/[a-f\d]{32}/),
        span_id: expect.stringMatching(/[a-f\d]{16}/),
        sampled: false,
        attributes: {
          [SENTRY_LINK_TYPE]: {
            type: 'string',
            value: 'previous_trace',
          },
        },
      },
    ]);

    expect(navigationSpan.attributes['sentry.previous_trace']).toEqual({
      type: 'string',
      value: expect.stringMatching(/[a-f\d]{32}-[a-f\d]{16}-0/),
    });

    expect(navigationSpan.trace_id).not.toEqual(navigationSpan.links![0].trace_id);
  });
});
