import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest(
  'Replay still records and sends a segment when session tracking is disabled',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipReplayTest()) {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    await page.locator('#disable-session-tracking').click();

    // Interact with the page to ensure Replay records something and flushes.
    const reqPromise1 = waitForReplayRequest(page, 1);
    await page.locator('#click-me').click();

    const [replayEvent0, replayEvent1] = await Promise.all([
      reqPromise0.then(getReplayEvent),
      reqPromise1.then(getReplayEvent),
    ]);

    expect(replayEvent0).toBeDefined();
    expect(replayEvent0.replay_type).toBe('session');
    expect(replayEvent0.segment_id).toBe(0);

    expect(replayEvent1).toBeDefined();
    expect(replayEvent1.replay_type).toBe('session');
    expect(replayEvent1.segment_id).toBe(1);
  },
);
