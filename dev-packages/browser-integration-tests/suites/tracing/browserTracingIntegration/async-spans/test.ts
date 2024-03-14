import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

type WindowWithSpan = Window & {
  firstWaitingSpan: any;
  secondWaitingSpan: any;
  thirdWaitingSpan: any;
};

sentryTest(
  'async spans with different durations lead to unexpected behavior in browser (no "asynchronous context tracking")',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });
    await page.goto(url);

    const envelope = await getFirstSentryEnvelopeRequest<Event>(page);
    expect(envelope).toBeDefined();

    const firstWaitingSpanValue = await page.evaluate(
      () => (window as unknown as WindowWithSpan).firstWaitingSpan._name,
    );
    const secondWaitingSpanName = await page.evaluate(
      () => (window as unknown as WindowWithSpan).secondWaitingSpan._name,
    );
    const thirdWaitingSpanName = await page.evaluate(
      () => (window as unknown as WindowWithSpan).thirdWaitingSpan._name,
    );

    expect(firstWaitingSpanValue).toBe('span 2');
    expect(secondWaitingSpanName).toBe('span 1');
    expect(thirdWaitingSpanName).toBe('span 3');
  },
);
