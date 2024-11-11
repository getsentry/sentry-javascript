import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import {
  REPLAY_DEFAULT_FLUSH_MAX_DELAY,
  getReplaySnapshot,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

sentryTest('should stop recording after receiving an error response', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }
  let called = 0;

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    called++;

    return route.fulfill({
      status: 400,
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname, skipDsnRouteHandler: true });
  await Promise.all([page.goto(url), waitForReplayRequest(page)]);

  await page.locator('button').click();

  expect(called).toBe(1);

  // Should immediately skip retrying and just cancel, no backoff
  // This waitForTimeout call should be okay, as we're not checking for any
  // further network requests afterwards.
  await page.waitForTimeout(REPLAY_DEFAULT_FLUSH_MAX_DELAY + 1);

  expect(called).toBe(1);

  const replay = await getReplaySnapshot(page);

  expect(replay._isEnabled).toBe(false);
});
