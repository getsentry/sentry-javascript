import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipCdnBundleTest, shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

// The click handler adds the class before the event timing entry records the target.
const SPOTLIGHT_BUTTON = 'body > div#sentry-spotlight > button.clicked';
const REGULAR_BUTTON = 'body > button.clicked';

sentryTest('filters spotlight interaction spans via ignoreSpans', async ({ getLocalTestUrl, page }) => {
  // spotlightBrowserIntegration is not available in CDN bundles.
  sentryTest.skip(shouldSkipTracingTest() || shouldSkipCdnBundleTest());
  const url = await getLocalTestUrl({ testDir: __dirname });
  const spans = collectStreamedSpans(page);
  const pageloadPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  await page.goto(url);
  await pageloadPromise;

  const spotlightPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'ui.action.click');
  await page.locator('[data-test-id=spotlight-button]').click();
  await expect(page.locator('.clicked[data-test-id=spotlight-button]')).toBeVisible();
  const spotlight = await spotlightPromise;
  expect(getSpanOp(spotlight)).toBe('ui.action.click');

  const regularPromise = waitForStreamedSpan(
    page,
    span => span.is_segment && getSpanOp(span) === 'ui.action.click' && span.span_id !== spotlight.span_id,
  );
  const regularInteractionPromise = waitForStreamedSpan(
    page,
    span => span.attributes['browser.web_vital.inp.target']?.value === REGULAR_BUTTON,
  );
  await page.locator('[data-test-id=regular-button]').click();
  await expect(page.locator('.clicked[data-test-id=regular-button]')).toBeVisible();
  const [regular, interaction] = await Promise.all([regularPromise, regularInteractionPromise]);
  await page.evaluate(() => (window as any).Sentry.flush());

  expect(getSpanOp(interaction)).toBe('ui.interaction.click');
  expect(interaction.parent_span_id).toBe(regular.span_id);
  expect(interaction.trace_id).toBe(regular.trace_id);
  expect(interaction.attributes['browser.web_vital.inp.target']?.value).not.toContain('#sentry-spotlight');
  expect(
    spans.filter(
      span =>
        getSpanOp(span) === 'ui.interaction.click' &&
        span.attributes['browser.web_vital.inp.target']?.value === SPOTLIGHT_BUTTON,
    ),
  ).toHaveLength(0);
});
