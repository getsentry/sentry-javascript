import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/browser';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'sets the source to custom when updating the transaction name with Sentry.updateSpanName',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    const traceContextData = eventData.contexts?.trace?.data;

    expect(traceContextData).toBeDefined();

    expect(traceContextData).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
    });

    expect(traceContextData!._sentry_span_name_set_by_user).toBeUndefined();

    expect(eventData.transaction).toBe('new name');

    expect(eventData.contexts?.trace?.op).toBe('pageload');
    expect(eventData.spans?.length).toBeGreaterThan(0);
    expect(eventData.transaction_info?.source).toEqual('custom');
  },
);
