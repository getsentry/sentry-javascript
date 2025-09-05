import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

const META_TAG_TRACE_ID = '12312012123120121231201212312012';
const META_TAG_PARENT_SPAN_ID = '1121201211212012';

sentryTest(
  'interaction spans continue trace from <meta> tag after pageload',
  async ({ browserName, getLocalTestUrl, page }) => {
    const supportedBrowsers = ['chromium', 'firefox'];

    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }
    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadRequestPromise = waitForTransactionRequest(page, e => e.contexts?.trace?.op === 'pageload');
    await page.goto(url);
    const pageloadTxnEvent = envelopeRequestParser(await pageloadRequestPromise);

    const interactionRequestPromise = waitForTransactionRequest(page, e => e.contexts?.trace?.op === 'ui.action.click');

    await page.locator('[data-test-id=interaction-button]').click();
    await page.locator('.clicked[data-test-id=interaction-button]').isVisible();

    const interactionTxnEvent = envelopeRequestParser(await interactionRequestPromise);

    const pageloadTxnTraceContext = pageloadTxnEvent.contexts?.trace;
    const interactionTxnTraceContext = interactionTxnEvent.contexts?.trace;

    expect(pageloadTxnTraceContext).toMatchObject({
      trace_id: META_TAG_TRACE_ID,
      parent_span_id: META_TAG_PARENT_SPAN_ID,
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });

    expect(interactionTxnTraceContext).toMatchObject({
      trace_id: META_TAG_TRACE_ID,
      parent_span_id: META_TAG_PARENT_SPAN_ID,
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });

    expect(interactionTxnTraceContext?.trace_id).toBe(pageloadTxnTraceContext?.trace_id);
    expect(interactionTxnTraceContext?.parent_span_id).toBe(pageloadTxnTraceContext?.parent_span_id);
  },
);
