import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, observeStreamedSpan, waitForStreamedSpan, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest(
  'filters ui.interaction.click spans for spotlight elements via ignoreSpans in streaming mode',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    // Set up an observer that fails if a spotlight interaction span is ever sent
    let sawSpotlightInteractionSpan = false;
    await observeStreamedSpan(page, span => {
      if (getSpanOp(span) === 'ui.interaction.click' && span.name?.includes('#sentry-spotlight')) {
        sawSpotlightInteractionSpan = true;
        return true;
      }
      return false;
    });

    await page.goto(url);

    // Wait for pageload to finish before clicking
    await waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

    // Click on the spotlight element — its ui.interaction.click child should be filtered
    await page.locator('[data-test-id=spotlight-button]').click();
    await page.locator('.clicked[data-test-id=spotlight-button]').isVisible();

    // Wait for the spotlight click's segment span to arrive
    await waitForStreamedSpans(page, spans =>
      spans.some(span => span.is_segment && getSpanOp(span) === 'ui.action.click'),
    );

    // Click on the regular button — its ui.interaction.click child should be kept
    const regularInteractionSpansPromise = waitForStreamedSpans(page, spans =>
      spans.some(span => getSpanOp(span) === 'ui.interaction.click' && !span.name?.includes('#sentry-spotlight')),
    );

    await page.locator('[data-test-id=regular-button]').click();
    await page.locator('.clicked[data-test-id=regular-button]').isVisible();

    const regularSpans = await regularInteractionSpansPromise;
    const regularInteractionSpan = regularSpans.find(
      span => getSpanOp(span) === 'ui.interaction.click' && !span.name?.includes('#sentry-spotlight'),
    );
    expect(regularInteractionSpan).toBeDefined();
    expect(regularInteractionSpan!.name).toContain('button');

    // Verify no spotlight interaction span was ever sent
    expect(sawSpotlightInteractionSpan).toBe(false);
  },
);
