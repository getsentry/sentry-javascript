import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplaySnapshot, shouldSkipReplayTest } from '../../../../utils/replayHelpers';

sentryTest(
  '[error-mode] should not start recording if an error occurred when the error was dropped',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipReplayTest()) {
      sentryTest.skip();
    }

    let callsToSentry = 0;

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      callsToSentry++;

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await page.click('#go-background');
    expect(callsToSentry).toEqual(0);

    await page.click('#error');

    await page.click('#go-background');
    await page.click('#log');
    await page.click('#go-background');

    expect(callsToSentry).toEqual(0);

    const replay = await getReplaySnapshot(page);
    expect(replay.recordingMode).toBe('error');
  },
);
