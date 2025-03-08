import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE, type Event } from '@sentry/core';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../../utils/helpers';

sentryTest(
  "links back to previous trace's local root span if continued from meta tags",
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadRequest = await getFirstSentryEnvelopeRequest<Event>(page, url);
    const navigationRequest = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);

    const pageloadTraceContext = pageloadRequest.contexts?.trace;
    const navigationTraceContext = navigationRequest.contexts?.trace;

    const metaTagTraceId = '12345678901234567890123456789012';

    const navigationTraceId = navigationTraceContext?.trace_id;

    expect(pageloadTraceContext?.op).toBe('pageload');
    expect(navigationTraceContext?.op).toBe('navigation');

    // sanity check
    expect(pageloadTraceContext?.trace_id).toBe(metaTagTraceId);
    expect(pageloadTraceContext?.links).toBeUndefined();

    expect(navigationTraceContext?.links).toEqual([
      {
        trace_id: metaTagTraceId,
        span_id: pageloadTraceContext?.span_id,
        sampled: true,
        attributes: {
          [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
        },
      },
    ]);

    expect(navigationTraceId).not.toEqual(metaTagTraceId);
  },
);
