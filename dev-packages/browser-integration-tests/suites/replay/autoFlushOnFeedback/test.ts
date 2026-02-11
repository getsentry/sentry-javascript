import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { getExpectedReplayEvent } from '../../../utils/replayEventTemplates';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

/*
 * In this test we want to verify that replay events are automatically flushed when user feedback is submitted via API / opening the widget.
 * We emulate this by firing the feedback events directly, which should trigger an immediate flush of any
 * buffered replay events, rather than waiting for the normal flush delay.
 */
sentryTest('replay events are flushed automatically on feedback events', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);
  const reqPromise2 = waitForReplayRequest(page, 2);

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);
  const replayEvent0 = getReplayEvent(await reqPromise0);
  expect(replayEvent0).toEqual(getExpectedReplayEvent());

  // Trigger one mouse click
  void page.locator('#something').click();

  // Open the feedback widget which should trigger an immediate flush
  await page.locator('#open').click();

  // This should be flushed immediately due to feedback widget being opened
  const replayEvent1 = getReplayEvent(await reqPromise1);
  expect(replayEvent1).toEqual(getExpectedReplayEvent({ segment_id: 1, urls: [] }));

  // trigger another click
  void page.locator('#something').click();

  // Send feedback via API which should trigger another immediate flush
  await page.locator('#send').click();

  // This should be flushed immediately due to feedback being sent
  const replayEvent2 = getReplayEvent(await reqPromise2);
  expect(replayEvent2).toEqual(getExpectedReplayEvent({ segment_id: 2, urls: [] }));
});
