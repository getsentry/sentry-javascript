import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipReplayTest } from '../../../utils/replayHelpers';

sentryTest('caps minReplayDuration to maximum of 50 seconds', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const actualMinReplayDuration = await page.evaluate(() => {
    // @ts-expect-error - Replay is not typed on window
    const replayIntegration = window.Replay;
    const replay = replayIntegration._replay;
    return replay.getOptions().minReplayDuration;
  });

  // Even though we configured it to 60s (60000ms), it should be capped to 50s
  expect(actualMinReplayDuration).toBe(50_000);
});
