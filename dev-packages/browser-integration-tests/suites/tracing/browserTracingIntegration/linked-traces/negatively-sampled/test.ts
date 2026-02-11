import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest('includes a span link to a previously negatively sampled span', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await sentryTest.step('Initial pageload', async () => {
    // No event to check for an event here because this pageload span is sampled negatively!
    await page.goto(url);
  });

  await sentryTest.step('Navigation', async () => {
    const navigationRequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'navigation');
    await page.goto(`${url}#foo`);
    const navigationEvent = envelopeRequestParser(await navigationRequestPromise);
    const navigationTraceContext = navigationEvent.contexts?.trace;

    expect(navigationTraceContext?.op).toBe('navigation');
    expect(navigationTraceContext?.links).toEqual([
      {
        trace_id: expect.stringMatching(/[a-f\d]{32}/),
        span_id: expect.stringMatching(/[a-f\d]{16}/),
        sampled: false,
        attributes: {
          [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
        },
      },
    ]);

    expect(navigationTraceContext?.data).toMatchObject({
      'sentry.previous_trace': expect.stringMatching(/[a-f\d]{32}-[a-f\d]{16}-0/),
    });

    expect(navigationTraceContext?.trace_id).not.toEqual(navigationTraceContext?.links![0].trace_id);
  });
});
