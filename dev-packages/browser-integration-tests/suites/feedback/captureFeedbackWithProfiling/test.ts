import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import {
  envelopeRequestParser,
  getEnvelopeType,
  shouldSkipFeedbackTest,
  shouldSkipTracingTest,
  waitForTransactionRequest,
} from '../../../utils/helpers';

sentryTest(
  'feedback should have trace_id when profiling is enabled and idle span has ended',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipFeedbackTest() || shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({
      testDir: __dirname,
      handleLazyLoadedFeedback: true,
      responseHeaders: { 'Document-Policy': 'js-profiling' },
    });

    // Wait for the pageload transaction to be sent (idle span ended)
    const pageloadRequestPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === 'pageload');

    const feedbackRequestPromise = page.waitForResponse(res => {
      const req = res.request();
      const postData = req.postData();
      if (!postData) {
        return false;
      }
      try {
        return getEnvelopeType(req) === 'feedback';
      } catch {
        return false;
      }
    });

    await page.goto(url);

    // Wait for the idle span to finish
    await pageloadRequestPromise;

    // Submit feedback after idle span ended — no active span
    await page.getByText('Report a Bug').click();
    await page.locator('[name="name"]').fill('Jane Doe');
    await page.locator('[name="email"]').fill('janedoe@example.org');
    await page.locator('[name="message"]').fill('feedback after idle span ended');
    await page.locator('[data-sentry-feedback] .btn--primary').click();

    const feedbackEvent = envelopeRequestParser((await feedbackRequestPromise).request());

    // BUG: With profiling enabled and no active span, attachProfiledThreadToEvent
    // creates a partial trace context { data: { thread.id, thread.name } } that
    // overwrites the real trace context (with trace_id/span_id) via spread in _prepareEvent.
    expect(feedbackEvent.contexts?.trace?.trace_id).toMatch(/\w{32}/);
    expect(feedbackEvent.contexts?.trace?.span_id).toMatch(/\w{16}/);
  },
);
