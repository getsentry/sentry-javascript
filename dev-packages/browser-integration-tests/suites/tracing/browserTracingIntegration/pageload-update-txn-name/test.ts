import { expect } from '@playwright/test';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/browser';
import { type Event, SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'sets the source to custom when updating the transaction name with `span.updateName`',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    const traceContextData = eventData.contexts?.trace?.data;

    expect(traceContextData).toBeDefined();

    expect(eventData.transaction).toBe('new name');

    expect(traceContextData).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
    });

    expect(traceContextData![SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]).toBeUndefined();

    expect(eventData.contexts?.trace?.op).toBe('pageload');
    expect(eventData.spans?.length).toBeGreaterThan(0);
    expect(eventData.transaction_info?.source).toEqual('custom');
  },
);
