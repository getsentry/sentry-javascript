import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('should handle custom added Replay integration', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const req = waitForReplayRequest(page);

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const eventData = getReplayEvent(await req);

  expect(eventData).toBeDefined();
  expect(eventData.segment_id).toBe(0);

  const useCompression = await page.evaluate(() => {
    const replay = (window as any).Sentry.getClient().getIntegrationByName('Replay');
    return replay._replay.getOptions().useCompression;
  });

  expect(useCompression).toEqual(false);
});
