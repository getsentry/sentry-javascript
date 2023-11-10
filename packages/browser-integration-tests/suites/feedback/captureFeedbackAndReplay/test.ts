import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, getEnvelopeType } from '../../../utils/helpers';
import {
  getCustomRecordingEvents,
  getReplayEvent,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

sentryTest('should capture feedback (@sentry-internal/feedback import)', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
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

  await page.goto(url);
  await page.getByText('Report a Bug').click();
  await page.locator('[name="name"]').fill('Jane Doe');
  await page.locator('[name="email"]').fill('janedoe@example.org');
  await page.locator('[name="message"]').fill('my example feedback');
  await page.getByLabel('Send Bug Report').click();

  const [feedbackResp, replayReq] = await Promise.all([feedbackRequestPromise, reqPromise0]);

  const feedbackEvent = envelopeRequestParser(feedbackResp.request());
  const replayEvent = getReplayEvent(replayReq);
  const { breadcrumbs } = getCustomRecordingEvents(replayReq);

  expect(breadcrumbs).toEqual(
    expect.arrayContaining([
      {
        category: 'sentry.feedback',
        data: { feedbackId: expect.any(String) },
      },
    ]),
  );

  expect(feedbackEvent).toEqual({
    type: 'feedback',
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
