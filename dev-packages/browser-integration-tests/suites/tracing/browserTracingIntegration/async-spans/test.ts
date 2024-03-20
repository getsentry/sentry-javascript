import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

type WindowWithSpan = Window & {
  firstWaitingSpan: any;
  secondWaitingSpan: any;
  thirdWaitingSpan: any;
};

sentryTest(
  'async spans with different durations lead to unexpected behavior in browser (no "asynchronous context tracking")',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });
    await page.goto(url);

    const envelope = await getFirstSentryEnvelopeRequest<Event>(page);
    expect(envelope).toBeDefined();

    const firstWaitingSpanValue = await page.evaluate(
      () => (window as unknown as WindowWithSpan).firstWaitingSpan.description,
    );
    const secondWaitingSpanName = await page.evaluate(
      () => (window as unknown as WindowWithSpan).secondWaitingSpan.description,
    );
    const thirdWaitingSpanName = await page.evaluate(
      () => (window as unknown as WindowWithSpan).thirdWaitingSpan.description,
    );

    expect(firstWaitingSpanValue).toBe('span 2');
    expect(secondWaitingSpanName).toBe('span 1');
    expect(thirdWaitingSpanName).toBe('span 3');
  },
);
