import { PAGELOAD } from '@sentry/conventions/op';
import {
  SENTRY_IDLE_SPAN_FINISH_REASON,
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/browser';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest('creates a pageload transaction with url as source', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadRequestPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === PAGELOAD);
  await page.goto(url);
  const eventData = envelopeRequestParser<Event>(await pageloadRequestPromise);
  const timeOrigin = await page.evaluate<number>('window._testBaseTimestamp');

  const { start_timestamp: startTimestamp } = eventData;

  const traceContextData = eventData.contexts?.trace?.data;

  expect(startTimestamp).toBeCloseTo(timeOrigin, 1);

  expect(traceContextData).toMatchObject({
    [SENTRY_ORIGIN]: 'auto.pageload.browser',
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
    [SENTRY_SEGMENT_NAME_SOURCE]: 'url',
    [SENTRY_OP]: PAGELOAD,
    [SENTRY_IDLE_SPAN_FINISH_REASON]: 'idleTimeout',
  });

  expect(eventData.contexts?.trace?.op).toBe(PAGELOAD);
  expect(eventData.spans?.length).toBeGreaterThan(0);
  expect(eventData.transaction_info?.source).toEqual('url');
});
