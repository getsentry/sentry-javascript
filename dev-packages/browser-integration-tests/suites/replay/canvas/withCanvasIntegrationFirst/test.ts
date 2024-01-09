import { expect } from '@playwright/test';
import type { ReplayCanvasIntegrationOptions } from '@sentry-internal/replay-canvas';

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

  const replay = await getReplaySnapshot(page);
  const canvasOptions = replay._integrations.canvas as ReplayCanvasIntegrationOptions;
  expect(canvasOptions.sampling.canvas).toBe(2);
  expect(canvasOptions.dataURLOptions.quality).toBe(0.4);
  expect(replay._hasCanvas).toBe(true);
});
