import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { hidePage, shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('does not capture interaction spans without the integration', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());
  const spans = collectStreamedSpans(page);
  const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);
  await pageloadPromise;
  await page.locator('[data-test-id=interaction-button]').click();
  await hidePage(page);
  await page.evaluate(() => (window as any).Sentry.flush());

  expect(spans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.browser.interactions')).toHaveLength(0);
});
