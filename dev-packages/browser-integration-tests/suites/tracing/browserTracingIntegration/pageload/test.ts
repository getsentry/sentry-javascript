import { expect } from '@playwright/test';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/browser';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('creates a pageload transaction with url as source', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const timeOrigin = await page.evaluate<number>('window._testBaseTimestamp');

  const { start_timestamp: startTimestamp } = eventData;

  const traceContextData = eventData.contexts?.trace?.data;

  expect(startTimestamp).toBeCloseTo(timeOrigin, 1);

  expect(traceContextData).toMatchObject({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
    ['sentry.idle_span_finish_reason']: 'idleTimeout',
  });

  expect(eventData.contexts?.trace?.op).toBe('pageload');
  expect(eventData.spans?.length).toBeGreaterThan(0);
  expect(eventData.transaction_info?.source).toEqual('url');
});
