import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplaySnapshot, shouldSkipReplayTest } from '../../../../utils/replayHelpers';

sentryTest('sets up canvas when adding ReplayCanvas integration after Replay', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const replay = await getReplaySnapshot(page);
  const canvasOptions = replay._options._experiments?.canvas;
  expect(canvasOptions.fps).toBe(4);
  expect(canvasOptions.quality).toBe(0.6);
  expect(replay._hasCanvas).toBe(true);
});
