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
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'ignoring an outgoing HTTP span preserves the positive sampling decision of a continued trace',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    const url = await getLocalTestUrl({ testDir: __dirname });
    const clientReportPromise = waitForClientReportRequest(page);
    const tracingHeadersPromise = waitForTracingHeadersOnUrl(page, 'http://sentry-test-external.io');
    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

    await page.goto(url);

    const [{ baggage, sentryTrace }, pageloadSpan] = await Promise.all([tracingHeadersPromise, pageloadSpanPromise]);
    expect(pageloadSpan.is_segment).toBe(true);
    expect(pageloadSpan.trace_id).toBe('12345678901234567890123456789012');
    expect(sentryTrace).toBe(`12345678901234567890123456789012-${pageloadSpan.span_id}-1`);
    expect(baggage).toEqual(
      'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=1,sentry-sampled=true,sentry-public_key=public,sentry-sample_rand=0.5',
    );

    await hidePage(page);
    const clientReport = envelopeRequestParser<ClientReport>(await clientReportPromise);
    expect(clientReport.discarded_events).toEqual([{ category: 'span', quantity: 1, reason: 'ignored' }]);
  },
);
