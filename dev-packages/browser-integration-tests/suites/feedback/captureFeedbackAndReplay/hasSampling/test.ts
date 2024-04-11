import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, getEnvelopeType, shouldSkipFeedbackTest } from '../../../../utils/helpers';
import {
  collectReplayRequests,
  getReplayBreadcrumbs,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../../utils/replayHelpers';

sentryTest('should capture feedback', async ({ forceFlushReplay, getLocalTestPath, page }) => {
  if (shouldSkipFeedbackTest() || shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);

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

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await Promise.all([page.goto(url), page.getByText('Report a Bug').click(), reqPromise0]);

  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayBreadcrumbs(recordingEvents).some(breadcrumb => breadcrumb.category === 'sentry.feedback');
  });

  // Inputs are slow, these need to be serial
  await page.locator('[name="name"]').fill('Jane Doe');
  await page.locator('[name="email"]').fill('janedoe@example.org');
  await page.locator('[name="message"]').fill('my example feedback');

  // Force flush here, as inputs are slow and can cause click event to be in unpredictable segments
  await Promise.all([forceFlushReplay()]);

  const [, feedbackResp] = await Promise.all([
    page.locator('[data-sentry-feedback] .btn--primary').click(),
    feedbackRequestPromise,
  ]);

  const { replayEvents, replayRecordingSnapshots } = await replayRequestPromise;
  const breadcrumbs = getReplayBreadcrumbs(replayRecordingSnapshots);

  const replayEvent = replayEvents[0];
  const feedbackEvent = envelopeRequestParser(feedbackResp.request());

  expect(breadcrumbs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        category: 'sentry.feedback',
        data: { feedbackId: expect.any(String) },
        timestamp: expect.any(Number),
        type: 'default',
      }),
    ]),
  );

  expect(feedbackEvent).toEqual({
    type: 'feedback',
    breadcrumbs: expect.any(Array),
    contexts: {
      feedback: {
        contact_email: 'janedoe@example.org',
        message: 'my example feedback',
        name: 'Jane Doe',
        replay_id: replayEvent.event_id,
        source: 'widget',
        url: expect.stringContaining('/dist/index.html'),
      },
    },
    level: 'info',
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
      url: expect.stringContaining('/dist/index.html'),
      headers: {
        'User-Agent': expect.stringContaining(''),
      },
    },
    platform: 'javascript',
  });
});
