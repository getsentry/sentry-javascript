import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE, type Event } from '@sentry/core';

import { sentryTest } from '../../../../../utils/fixtures';
import {
  envelopeRequestParser,
  getFirstSentryEnvelopeRequest,
  shouldSkipTracingTest,
  waitForTransactionRequest,
} from '../../../../../utils/helpers';

sentryTest(
  'adds link between hard page reload traces when opting into sessionStorage',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageload1Event = await getFirstSentryEnvelopeRequest<Event>(page, url);

    const pageload2RequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');
    await page.reload();
    const pageload2Event = envelopeRequestParser(await pageload2RequestPromise);

    const pageload1TraceContext = pageload1Event.contexts?.trace;
    expect(pageload1TraceContext).toBeDefined();
    expect(pageload1TraceContext?.links).toBeUndefined();

    expect(pageload2Event.contexts?.trace?.links).toEqual([
      {
        trace_id: pageload1TraceContext?.trace_id,
        span_id: pageload1TraceContext?.span_id,
        sampled: true,
        attributes: { [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace' },
      },
    ]);

    expect(pageload1TraceContext?.trace_id).not.toEqual(pageload2Event.contexts?.trace?.trace_id);
  },
);
