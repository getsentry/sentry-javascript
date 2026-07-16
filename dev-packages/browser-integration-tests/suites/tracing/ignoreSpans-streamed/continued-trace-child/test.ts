import { expect } from '@playwright/test';
import type { ClientReport } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  hidePage,
  shouldSkipTracingTest,
  waitForClientReportRequest,
  waitForTracingHeadersOnUrl,
} from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest(
  'ignoring a child span preserves the positive sampling decision of a continued trace when propagating it',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    const url = await getLocalTestUrl({ testDir: __dirname });

    const clientReportPromise = waitForClientReportRequest(page);
    const tracingHeadersPromise = waitForTracingHeadersOnUrl(page, 'http://sentry-test-external.io');
    const spansPromise = waitForStreamedSpans(
      page,
      spans =>
        spans.some(span => getSpanOp(span) === 'pageload') && spans.some(span => getSpanOp(span) === 'http.client'),
    );

    await page.goto(url);

    const [{ baggage, sentryTrace }, spans] = await Promise.all([tracingHeadersPromise, spansPromise]);
    const pageloadSpan = spans.find(span => getSpanOp(span) === 'pageload');
    const httpClientSpan = spans.find(span => getSpanOp(span) === 'http.client');

    expect(pageloadSpan?.is_segment).toBe(true);
    expect(pageloadSpan?.trace_id).toBe('12345678901234567890123456789012');
    expect(httpClientSpan?.parent_span_id).toBe(pageloadSpan?.span_id);
    expect(sentryTrace).toBe(`${pageloadSpan?.trace_id}-${httpClientSpan?.span_id}-1`);
    expect(baggage).toEqual(
      'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=1,sentry-sampled=true,sentry-public_key=public,sentry-sample_rand=0.5',
    );

    await hidePage(page);
    const clientReport = envelopeRequestParser<ClientReport>(await clientReportPromise);
    expect(clientReport.discarded_events).toEqual([{ category: 'span', quantity: 1, reason: 'ignored' }]);
  },
);
