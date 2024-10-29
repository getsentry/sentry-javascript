import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplaySnapshot, shouldSkipReplayTest } from '../../../../utils/replayHelpers';

sentryTest(
  '[error-mode] should handle errors that result in API error response',
  async ({ getLocalTestPath, page, forceFlushReplay }) => {
    if (shouldSkipReplayTest()) {
      sentryTest.skip();
    }

    let callsToSentry = 0;

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      callsToSentry++;

      return route.fulfill({
        status: 422,
        contentType: 'application/json',
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname, skipDsnRouteHandler: true });

    await page.goto(url);
    await forceFlushReplay();
    expect(callsToSentry).toEqual(0);

    await page.locator('#error').click();

    await page.locator('#log').click();
    await forceFlushReplay();

    // Only sent once, but since API failed we do not go into session mode
    expect(callsToSentry).toEqual(1);

    const replay = await getReplaySnapshot(page);
    expect(replay.recordingMode).toBe('buffer');
  },
);
