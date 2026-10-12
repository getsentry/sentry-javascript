import {
  URL_PATH,
  SENTRY_IDLE_SPAN_FINISH_REASON,
  USER_AGENT_ORIGINAL,
  URL_FULL,
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('should create a navigation span that aborts an ongoing pageload', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');

  await page.goto(url);

  const pageloadSpan = await pageloadSpanPromise;
  const navigationSpan = await navigationSpanPromise;
  await page.evaluate(() => (window as any).Sentry.flush());

  expect(getSpanOp(pageloadSpan)).toBe('pageload');
  expect(getSpanOp(navigationSpan)).toBe('navigation');

  expect(navigationSpan.attributes[SENTRY_SEGMENT_NAME_SOURCE]?.value).toEqual('url');

  const pageloadTraceId = pageloadSpan.trace_id;
  const navigationTraceId = navigationSpan.trace_id;

  expect(pageloadTraceId).toBeDefined();
  expect(navigationTraceId).toBeDefined();
  expect(pageloadTraceId).not.toEqual(navigationTraceId);

  expect(pageloadSpan.name).toEqual('Pageload');
  expect(pageloadSpan.attributes[URL_PATH]?.value).toEqual('/index.html');
  expect(navigationSpan.name).toEqual('Navigation');
  expect(navigationSpan.attributes[URL_PATH]?.value).toEqual('/sub-page');

  expect(pageloadSpan.attributes).toMatchObject({
    [SENTRY_ORIGIN]: { type: 'string', value: 'auto.pageload.browser' },
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: { type: 'integer', value: 1 },
    [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'url' },
    [SENTRY_OP]: { type: 'string', value: 'pageload' },
    [SENTRY_IDLE_SPAN_FINISH_REASON]: { type: 'string', value: 'cancelled' },
  });
  expect(navigationSpan.attributes).toMatchObject({
    [SENTRY_ORIGIN]: { type: 'string', value: 'auto.navigation.browser' },
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: { type: 'integer', value: 1 },
    [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'url' },
    [SENTRY_OP]: { type: 'string', value: 'navigation' },
    [SENTRY_IDLE_SPAN_FINISH_REASON]: { type: 'string', value: 'idleTimeout' },
  });
  expect(pageloadSpan.attributes).toMatchObject({
    [USER_AGENT_ORIGINAL]: { type: 'string', value: expect.any(String) },
    [URL_FULL]: { type: 'string', value: 'http://sentry-test.io/index.html' },
  });
  expect(navigationSpan.attributes).toMatchObject({
    [USER_AGENT_ORIGINAL]: { type: 'string', value: expect.any(String) },
    [URL_FULL]: { type: 'string', value: 'http://sentry-test.io/sub-page' },
  });
});
