import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getReplaySnapshot, shouldSkipReplayTest } from '../../../utils/replayHelpers';

sentryTest('should not send replays if both sample rates are 0', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    // This should never be called!
    expect(true).toBe(false);

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname, skipDsnRouteHandler: true });
  await page.goto(url);

  await page.locator('button').click();

  const replay = await getReplaySnapshot(page);

  expect(replay.session).toBe(undefined);
  expect(replay._isEnabled).toBe(false);
  expect(replay.recordingMode).toBe('session');

  // Cannot wait on getFirstSentryEnvelopeRequest, as that never resolves
});
