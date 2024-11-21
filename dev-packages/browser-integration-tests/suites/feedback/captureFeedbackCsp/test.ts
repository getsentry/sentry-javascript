import { expect } from '@playwright/test';

import { TEST_HOST, sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, getEnvelopeType, shouldSkipFeedbackTest } from '../../../utils/helpers';

sentryTest('should capture feedback', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipFeedbackTest()) {
    sentryTest.skip();
  }

  const feedbackRequestPromise = page.waitForResponse(res => {
    const req = res.request();

    const postData = req.postData();
    if (!postData) {
      return false;
    }

    try {
      return getEnvelopeType(req) === 'feedback';
    } catch (err) {
      return false;
    }
  });

  const url = await getLocalTestUrl({ testDir: __dirname, handleLazyLoadedFeedback: true });

  await page.goto(url);
  await page.getByText('Report a Bug').click();
  expect(await page.locator(':visible:text-is("Report a Bug")').count()).toEqual(1);
  await page.locator('[name="name"]').fill('Jane Doe');
  await page.locator('[name="email"]').fill('janedoe@example.org');
  await page.locator('[name="message"]').fill('my example feedback');
  await page.locator('[data-sentry-feedback] .btn--primary').click();

  const feedbackEvent = envelopeRequestParser((await feedbackRequestPromise).request());
  expect(feedbackEvent).toEqual({
    type: 'feedback',
    breadcrumbs: expect.any(Array),
    contexts: {
      feedback: {
        contact_email: 'janedoe@example.org',
        message: 'my example feedback',
        name: 'Jane Doe',
        source: 'widget',
        url: `${TEST_HOST}/index.html`,
      },
      trace: {
        trace_id: expect.stringMatching(/\w{32}/),
        span_id: expect.stringMatching(/\w{16}/),
      },
    },
    level: 'info',
    tags: {
      from: 'integration init',
    },
    timestamp: expect.any(Number),
    event_id: expect.stringMatching(/\w{32}/),
    environment: 'production',
    sdk: {
      integrations: expect.arrayContaining(['Feedback']),
      version: expect.any(String),
      name: 'sentry.javascript.browser',
      packages: expect.anything(),
    },
    request: {
      url: `${TEST_HOST}/index.html`,
      headers: {
        'User-Agent': expect.stringContaining(''),
      },
    },
    platform: 'javascript',
  });
  const cspViolation = await page.evaluate<boolean>('window.__CSPVIOLATION__');
  expect(cspViolation).toBe(false);
});
