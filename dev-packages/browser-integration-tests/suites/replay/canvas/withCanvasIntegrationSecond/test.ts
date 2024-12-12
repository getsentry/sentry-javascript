import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplaySnapshot, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('sets up canvas when adding ReplayCanvas integration after Replay', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest() || (process.env.PW_BUNDLE || '').startsWith('bundle')) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);
  await reqPromise0;

  const replay = await getReplaySnapshot(page);
  const canvasOptions = replay._canvas;
  expect(canvasOptions?.sampling.canvas).toBe(2);
  expect(canvasOptions?.dataURLOptions.quality).toBe(0.4);
  expect(replay._hasCanvas).toBe(true);
});
