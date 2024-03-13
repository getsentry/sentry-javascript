import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';

type WindowWithSpan = Window & {
  firstWaitingSpan: any;
  secondWaitingSpan: any;
  thirdWaitingSpan: any;
};

sentryTest(
  'async spans with different durations lead to unexpected behavior in browser (no "asynchronous context tracking")',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });
    page.goto(url);

    await page.waitForFunction(
      () =>
        (window as unknown as WindowWithSpan).firstWaitingSpan &&
        (window as unknown as WindowWithSpan).secondWaitingSpan &&
        (window as unknown as WindowWithSpan).thirdWaitingSpan,
    );

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
