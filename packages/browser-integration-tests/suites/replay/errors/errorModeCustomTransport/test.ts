import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplaySnapshot, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest(
  '[error-mode] should handle errors with custom transport',
  async ({ getLocalTestPath, page, forceFlushReplay, isReplayCapableBundle }) => {
    if (!isReplayCapableBundle()) {
      sentryTest.skip();
    }

    const promiseReq0 = waitForReplayRequest(page, 0);
    const promiseReq1 = waitForReplayRequest(page, 1);

    let callsToSentry = 0;

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      callsToSentry++;

      return route.fulfill({
        // Only error out for error, then succeed
        status: callsToSentry === 1 ? 422 : 200,
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await forceFlushReplay();
    expect(callsToSentry).toEqual(0);

    await page.click('#error');
    await promiseReq0;

    await forceFlushReplay();
    await promiseReq1;

    const replay = await getReplaySnapshot(page);
    expect(replay.recordingMode).toBe('session');
  },
);
