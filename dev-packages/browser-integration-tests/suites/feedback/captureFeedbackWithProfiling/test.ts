import { expect } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '../../../utils/spanUtils';
import { sentryTest } from '../../../utils/fixtures';
import {
  envelopeRequestParser,
  getEnvelopeType,
  shouldSkipFeedbackTest,
  shouldSkipTracingTest,
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

    // Wait for the idle pageload span to end.
    const pageloadSpanPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');

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

    // Wait for the idle page load span to finish
    const pageloadSpan = await pageloadSpanPromise;

    // Submit feedback after idle span ended — no active span
    await page.getByText('Report a Bug').waitFor({ state: 'visible' });
    await page.getByText('Report a Bug').click();
    await page.locator('[name="name"]').fill('Jane Doe');
    await page.locator('[name="email"]').fill('janedoe@example.org');
    await page.locator('[name="message"]').fill('feedback after idle span ended');
    await page.locator('[data-sentry-feedback] .btn--primary').click();

    const feedbackEvent = envelopeRequestParser((await feedbackRequestPromise).request());

    expect(feedbackEvent.contexts?.trace?.trace_id).toMatch(/\w{32}/);
    expect(feedbackEvent.contexts?.trace?.span_id).toMatch(/\w{16}/);

    expect(pageloadSpan.attributes['thread.id']).toEqual({ type: 'string', value: '0' });
    expect(pageloadSpan.attributes['thread.name']).toEqual({ type: 'string', value: 'main' });

    const profilerId = pageloadSpan.attributes['sentry.profiler_id']?.value;
    expect(profilerId).toMatch(/^[a-f\d]{32}$/);
    expect(feedbackEvent.contexts?.profile?.profiler_id).toBe(profilerId);
  },
);
