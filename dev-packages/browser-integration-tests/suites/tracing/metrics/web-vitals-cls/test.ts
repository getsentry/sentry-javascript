import {
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_EXCLUSIVE_TIME,
  USER_AGENT_ORIGINAL,
  SENTRY_SEGMENT_NAME,
  SENTRY_PAGELOAD_SPAN_ID,
  BROWSER_WEB_VITAL_CLS_VALUE,
} from '@sentry/conventions/attributes';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { hidePage, shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest.beforeEach(async ({ browserName, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.setViewportSize({ width: 800, height: 1200 });
});

function waitForLayoutShift(page: Page): Promise<void> {
  return page.evaluate(() => {
    return new Promise(resolve => {
      window.addEventListener('cls-done', () => resolve());
    });
  });
}

sentryTest('captures CLS as a streamed span with source attributes', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const clsSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.webvital.cls');
  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

  await page.goto(`${url}#0.15`);
  await waitForLayoutShift(page);
  await hidePage(page);

  const clsSpan = await clsSpanPromise;
  const pageloadSpan = await pageloadSpanPromise;

  expect(clsSpan.attributes[SENTRY_OP]).toEqual({ type: 'string', value: 'ui.webvital.cls' });
  expect(clsSpan.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: 'auto.http.browser.cls' });
  expect(clsSpan.attributes[SENTRY_EXCLUSIVE_TIME]).toEqual({ type: 'integer', value: 0 });
  expect(clsSpan.attributes[USER_AGENT_ORIGINAL]?.value).toEqual(expect.stringContaining('Chrome'));

  // Check the CLS span carries the segment name it belongs to
  expect(clsSpan.attributes[SENTRY_SEGMENT_NAME]).toEqual({ type: 'string', value: 'Pageload' });

  // Check browser.web_vital.cls.source attributes
  expect(clsSpan.attributes['browser.web_vital.cls.source.1']?.value).toEqual(
    expect.stringContaining('body > div#content > p'),
  );

  // Check pageload span id is present
  expect(clsSpan.attributes[SENTRY_PAGELOAD_SPAN_ID]?.value).toBe(pageloadSpan.span_id);

  // CLS is a point-in-time metric
  expect(clsSpan.start_timestamp).toEqual(clsSpan.end_timestamp);

  expect(clsSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(clsSpan.trace_id).toMatch(/^[\da-f]{32}$/);

  expect(clsSpan.parent_span_id).toBe(pageloadSpan.span_id);
  expect(clsSpan.trace_id).toBe(pageloadSpan.trace_id);
});

[
  { cls: 0.05, min: 0.03, max: 0.07, source: 'body > div#content > p#partial' },
  { cls: 0.21, min: 0.18, max: 0.23, source: 'body > div#content > p' },
  { cls: 0.35, min: 0.34, max: 0.36, source: 'body > div#content > p' },
].forEach(({ cls, min, max, source }) => {
  sentryTest(`captures CLS ${cls} with its source`, async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    const clsPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.webvital.cls');
    await page.goto(`${url}#${cls}`);
    await waitForLayoutShift(page);
    await hidePage(page);
    const span = await clsPromise;

    expect(span.attributes[BROWSER_WEB_VITAL_CLS_VALUE]?.type).toBe('double');
    const value = span.attributes[BROWSER_WEB_VITAL_CLS_VALUE]?.value;
    expect(value).toBeGreaterThan(min);
    expect(value).toBeLessThan(max);
    expect(span.attributes['browser.web_vital.cls.source.1']).toEqual({ type: 'string', value: source });
  });
});
