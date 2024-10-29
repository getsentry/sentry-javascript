import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplaySnapshot, shouldSkipReplayTest } from '../../../../utils/replayHelpers';

sentryTest('does not setup up canvas without ReplayCanvas integration', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const replay = await getReplaySnapshot(page);
  const canvasOptions = replay._canvas;
  expect(canvasOptions).toBe(undefined);
  expect(replay._hasCanvas).toBe(false);
});
