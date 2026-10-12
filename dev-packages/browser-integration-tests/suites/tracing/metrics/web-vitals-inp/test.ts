import { PAGELOAD, UI_INTERACTION_CLICK } from '@sentry/conventions/op';
import {
  SENTRY_OP,
  SENTRY_ORIGIN,
  USER_AGENT_ORIGINAL,
  SENTRY_TRANSACTION,
  SENTRY_SEGMENT_NAME,
  BROWSER_WEB_VITAL_INP_VALUE,
  SENTRY_EXCLUSIVE_TIME,
  UI_COMPONENT_NAME,
  BROWSER_WEB_VITAL_INP_TARGET,
} from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { hidePage, shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest.beforeEach(async ({ browserName }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }
});

sentryTest('captures INP click as a streamed span', async ({ getLocalTestUrl, page }) => {
  const spans = collectStreamedSpans(page);
  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === PAGELOAD);
  const inpSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === UI_INTERACTION_CLICK);

  await page.goto(url);

  await page.locator('[data-test-id=normal-button]').click();
  await expect(page.locator('.clicked[data-test-id=normal-button]')).toBeVisible();

  await hidePage(page);

  await inpSpanPromise;
  await page.evaluate(() => (window as any).Sentry.flush());
  const inpSpans = spans.filter(span => getSpanOp(span) === UI_INTERACTION_CLICK);
  expect(inpSpans).toHaveLength(1);
  const [inpSpan] = inpSpans;
  const pageloadSpan = await pageloadSpanPromise;

  expect(inpSpan.attributes[SENTRY_OP]).toEqual({ type: 'string', value: UI_INTERACTION_CLICK });
  expect(inpSpan.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: 'auto.http.browser.inp' });
  expect(inpSpan.attributes[USER_AGENT_ORIGINAL]?.value).toEqual(expect.stringContaining('Chrome'));

  // Check the INP span carries the transaction/segment name it belongs to
  expect(inpSpan.attributes[SENTRY_TRANSACTION]).toEqual({ type: 'string', value: 'Pageload' });
  expect(inpSpan.attributes[SENTRY_SEGMENT_NAME]).toEqual({ type: 'string', value: 'Pageload' });

  const inpValue = inpSpan.attributes[BROWSER_WEB_VITAL_INP_VALUE]?.value as number;
  expect(inpValue).toBeGreaterThan(0);

  expect(inpSpan.attributes[SENTRY_EXCLUSIVE_TIME]?.value).toBeGreaterThan(0);

  expect(inpSpan.name).toBe('NormalButton');
  expect(inpSpan.attributes[UI_COMPONENT_NAME]).toEqual({ type: 'string', value: 'NormalButton' });
  expect(inpSpan.attributes[BROWSER_WEB_VITAL_INP_TARGET]).toEqual({ type: 'string', value: 'body > NormalButton' });

  expect(inpSpan.end_timestamp).toBeGreaterThan(inpSpan.start_timestamp);

  expect(inpSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(inpSpan.trace_id).toMatch(/^[\da-f]{32}$/);

  expect(inpSpan.parent_span_id).toBe(pageloadSpan.span_id);
  expect(inpSpan.trace_id).toBe(pageloadSpan.trace_id);
});

sentryTest('captures the slowest interaction as streamed INP span', async ({ getLocalTestUrl, page }) => {
  const spans = collectStreamedSpans(page);
  const url = await getLocalTestUrl({ testDir: __dirname });

  const inpSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === UI_INTERACTION_CLICK);

  await page.goto(url);

  await page.locator('[data-test-id=normal-button]').click();
  await expect(page.locator('.clicked[data-test-id=normal-button]')).toBeVisible();

  await page.locator('[data-test-id=slow-button]').click();
  await expect(page.locator('.clicked[data-test-id=slow-button]')).toBeVisible();

  await hidePage(page, '[data-test-id=slow-button]');

  await inpSpanPromise;
  await page.evaluate(() => (window as any).Sentry.flush());
  const inpSpans = spans.filter(span => getSpanOp(span) === UI_INTERACTION_CLICK);
  expect(inpSpans).toHaveLength(1);
  const [inpSpan] = inpSpans;

  expect(inpSpan.name).toBe('SlowButton');
  expect(inpSpan.attributes[UI_COMPONENT_NAME]).toEqual({ type: 'string', value: 'SlowButton' });
  expect(inpSpan.attributes[BROWSER_WEB_VITAL_INP_TARGET]).toEqual({ type: 'string', value: 'body > SlowButton' });
  expect(inpSpan.attributes[SENTRY_EXCLUSIVE_TIME]?.value).toBeGreaterThan(400);

  const inpValue = inpSpan.attributes[BROWSER_WEB_VITAL_INP_VALUE]?.value as number;
  expect(inpValue).toBeGreaterThan(400);
});
