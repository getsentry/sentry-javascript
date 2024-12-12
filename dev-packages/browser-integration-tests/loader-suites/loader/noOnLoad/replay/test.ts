import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

const bundle = process.env.PW_BUNDLE || '';

sentryTest('should capture a replay', async ({ getLocalTestUrl, page }) => {
  // When in buffer mode, there will not be a replay by default
  if (shouldSkipReplayTest() || bundle === 'loader_replay_buffer') {
    sentryTest.skip();
  }

  const req = waitForReplayRequest(page);

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const eventData = getReplayEvent(await req);

  expect(eventData).toBeDefined();
  expect(eventData.segment_id).toBe(0);
});
