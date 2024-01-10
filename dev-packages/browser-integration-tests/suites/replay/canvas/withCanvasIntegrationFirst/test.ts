import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplaySnapshot, shouldSkipReplayTest } from '../../../../utils/replayHelpers';

sentryTest('sets up canvas when adding ReplayCanvas integration first', async ({ getLocalTestUrl, page }) => {
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

  page.on('console', (m) => {
    console.log(m);
  });
  const replay = await getReplaySnapshot(page);
  const canvasOptions = replay._canvas;
  expect(canvasOptions?.sampling.canvas).toBe(2);
  expect(canvasOptions?.dataURLOptions.quality).toBe(0.4);
  expect(replay._hasCanvas).toBe(true);
});
