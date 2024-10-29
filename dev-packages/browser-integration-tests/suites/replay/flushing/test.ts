import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getExpectedReplayEvent } from '../../../utils/replayEventTemplates';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

/*
 * In this test we're explicitly not forcing a flush by triggering a visibility change.
 * Instead, we want to verify that the `flushMaxDelay` works in the sense that eventually
 * a flush is triggered if some events are in the buffer.
 * Note: Due to timing problems and inconsistencies in Playwright/CI, we can't reliably
 * assert on the flush timestamps. Therefore we only assert that events were eventually
 * sent (i.e. flushed).
 */
sentryTest('replay events are flushed after max flush delay was reached', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);
  const reqPromise2 = waitForReplayRequest(page, 2);

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  const replayEvent0 = getReplayEvent(await reqPromise0);
  expect(replayEvent0).toEqual(getExpectedReplayEvent());

  // trigger one mouse click
  void page.locator('#something').click();

  // this must eventually lead to a flush after the max delay was reached
  const replayEvent1 = getReplayEvent(await reqPromise1);
  expect(replayEvent1).toEqual(getExpectedReplayEvent({ segment_id: 1, urls: [] }));

  // trigger mouse click every 100ms, it should still flush after the max delay even if clicks are ongoing
  for (let i = 0; i < 700; i++) {
    setTimeout(async () => {
      try {
        await page.locator('#something').click();
      } catch {
        // ignore errors here, we don't care if the page is closed
      }
    }, i * 100);
  }

  const replayEvent2 = getReplayEvent(await reqPromise2);
  expect(replayEvent2).toEqual(getExpectedReplayEvent({ segment_id: 2, urls: [] }));
});
