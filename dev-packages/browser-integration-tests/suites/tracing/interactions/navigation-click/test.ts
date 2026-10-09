import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('starts a root navigation segment when a click triggers navigation', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());
  const spans = collectStreamedSpans(page);
  const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);
  await pageloadPromise;

  const interactionPromise = waitForStreamedSpan(
    page,
    span => span.is_segment && getSpanOp(span) === 'ui.action.click',
  );
  const navigationPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'navigation');
  await page.locator('[data-test-id=navigate-button]').click();
  const [interaction, navigation] = await Promise.all([interactionPromise, navigationPromise]);
  await page.evaluate(() => (window as any).Sentry.flush());

  expect(navigation.is_segment).toBe(true);
  expect(navigation).not.toHaveProperty('parent_span_id');
  expect(navigation.trace_id).not.toBe(interaction.trace_id);
  const children = spans.filter(span => span.parent_span_id === interaction.span_id);
  expect(children.filter(span => ['navigation', 'http.server'].includes(getSpanOp(span) ?? ''))).toHaveLength(0);
});
