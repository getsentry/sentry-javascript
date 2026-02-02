import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import type { EventAndTraceHeader } from '../../../../utils/helpers';
import {
  eventAndTraceHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

const META_TAG_TRACE_ID = '12345678901234567890123456789012';
const META_TAG_PARENT_SPAN_ID = '1234567890123456';
const META_TAG_BAGGAGE =
  'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=0.2,sentry-sampled=true,sentry-transaction=my-transaction,sentry-public_key=public,sentry-release=1.0.0,sentry-environment=prod,sentry-sample_rand=0.42';

sentryTest(
  'create a new trace for a navigation after the server timing headers',
  async ({ getLocalTestUrl, page, enableConsole }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    enableConsole();

    const url = await getLocalTestUrl({
      testDir: __dirname,
      responseHeaders: {
        'Server-Timing': `sentry-trace;desc=${META_TAG_TRACE_ID}-${META_TAG_PARENT_SPAN_ID}-1, baggage;desc="${META_TAG_BAGGAGE}"`,
      },
    });

    const [pageloadEvent, pageloadTraceHeader] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      url,
      eventAndTraceHeaderRequestParser,
    );
    const [navigationEvent, navigationTraceHeader] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      `${url}#foo`,
      eventAndTraceHeaderRequestParser,
    );

    const pageloadTraceContext = pageloadEvent.contexts?.trace;
    const navigationTraceContext = navigationEvent.contexts?.trace;

    expect(pageloadEvent.type).toEqual('transaction');
    expect(pageloadTraceContext).toMatchObject({
      op: 'pageload',
      trace_id: META_TAG_TRACE_ID,
      parent_span_id: META_TAG_PARENT_SPAN_ID,
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });

    expect(pageloadTraceHeader).toEqual({
      environment: 'prod',
      release: '1.0.0',
      sample_rate: '0.2',
      sampled: 'true',
      transaction: 'my-transaction',
      public_key: 'public',
      trace_id: META_TAG_TRACE_ID,
      sample_rand: '0.42',
    });

    expect(navigationEvent.type).toEqual('transaction');
    expect(navigationTraceContext).toMatchObject({
      op: 'navigation',
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });
    // navigation span is head of trace, so there's no parent span:
    expect(navigationTraceContext).not.toHaveProperty('parent_span_id');

    expect(navigationTraceHeader).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: navigationTraceContext?.trace_id,
      sample_rand: expect.any(String),
    });

    expect(pageloadTraceContext?.trace_id).not.toEqual(navigationTraceContext?.trace_id);
    expect(pageloadTraceHeader?.sample_rand).not.toEqual(navigationTraceHeader?.sample_rand);
  },
);
