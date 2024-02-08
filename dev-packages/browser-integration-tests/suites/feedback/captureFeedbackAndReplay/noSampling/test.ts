import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplayEvent, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest(
  'should capture feedback with no replay sampling when Form opens (@sentry-internal/feedback import)',
  async ({ getLocalTestPath, page }) => {
    if (process.env.PW_BUNDLE) {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);
    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    const [, , replayReq] = await Promise.all([page.goto(url), page.getByText('Report a Bug').click(), reqPromise0]);

    const replayEvent = getReplayEvent(replayReq);
    expect(replayEvent.segment_id).toBe(0);
    expect(replayEvent.replay_type).toBe('buffer');
  },
);
