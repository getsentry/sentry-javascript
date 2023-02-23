import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getExpectedReplayEvent } from '../../../utils/replayEventTemplates';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

// Sync this with init.js - not we take seconds here instead of ms
const FLUSH_DELAY_SECONDS = 0.5;

for (let index = 0; index < 25; index++) {
  sentryTest(`replay recording flushes every FLUSH_DELAY_SECONDS (${index})}`, async ({ getLocalTestPath, page }) => {
    if (shouldSkipReplayTest()) {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, 1);
    const reqPromise2 = waitForReplayRequest(page, 2);

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    const replayEvent0 = getReplayEvent(await reqPromise0);
    expect(replayEvent0).toEqual(getExpectedReplayEvent());

    // trigger mouse click
    void page.click('#go-background');

    const replayEvent1 = getReplayEvent(await reqPromise1);
    expect(replayEvent1).toEqual(
      getExpectedReplayEvent({ replay_start_timestamp: undefined, segment_id: 1, urls: [] }),
    );

    // trigger mouse click every 100ms, it should still flush after 0.5s even if clicks are ongoing
    for (let i = 0; i < 70; i++) {
      setTimeout(async () => {
        try {
          await page.click('#something');
        } catch {
          // ignore errors here, we don't care if the page is closed
        }
      }, i * 50);
    }

    const replayEvent2 = getReplayEvent(await reqPromise2);
    expect(replayEvent2).toEqual(
      getExpectedReplayEvent({ replay_start_timestamp: undefined, segment_id: 2, urls: [] }),
    );

    // Ensure time diff is about 500ms between each event
    const diff1 = replayEvent1.timestamp! - replayEvent0.timestamp!;
    const diff2 = replayEvent2.timestamp! - replayEvent1.timestamp!;

    // We want to check that the diff is between 0.05 and 0.95 seconds, to accomodate for some wiggle room
    expect(diff1).toBeLessThan(FLUSH_DELAY_SECONDS + 0.45);
    expect(diff1).toBeGreaterThanOrEqual(FLUSH_DELAY_SECONDS - 0.45);
    expect(diff2).toBeLessThan(FLUSH_DELAY_SECONDS + 0.45);
    expect(diff2).toBeGreaterThanOrEqual(FLUSH_DELAY_SECONDS - 0.45);
  });
}
