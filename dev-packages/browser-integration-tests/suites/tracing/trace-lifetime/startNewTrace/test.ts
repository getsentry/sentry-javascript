import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'creates a new trace if `startNewTrace` is called and leaves old trace valid outside the callback',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    await page.goto(url);
    const pageloadSpan = await pageloadSpanPromise;

    const newTraceSpanPromise = waitForStreamedSpan(page, span => span.name === 'new-trace');
    const oldTraceSpanPromise = waitForStreamedSpan(page, span => span.name === 'old-trace');

    await page.locator('#newTrace').click();
    await page.locator('#oldTrace').click();

    const [newTraceSpan, oldTraceSpan] = await Promise.all([newTraceSpanPromise, oldTraceSpanPromise]);

    expect(getSpanOp(newTraceSpan)).toEqual('ui.interaction.click');
    expect(newTraceSpan.trace_id).toMatch(/^[\da-f]{32}$/);
    expect(newTraceSpan.span_id).toMatch(/^[\da-f]{16}$/);

    expect(getSpanOp(oldTraceSpan)).toEqual('ui.interaction.click');
    expect(oldTraceSpan.trace_id).toMatch(/^[\da-f]{32}$/);
    expect(oldTraceSpan.span_id).toMatch(/^[\da-f]{16}$/);

    expect(oldTraceSpan.trace_id).toEqual(pageloadSpan.trace_id);
    expect(newTraceSpan.trace_id).not.toEqual(pageloadSpan.trace_id);
  },
);
