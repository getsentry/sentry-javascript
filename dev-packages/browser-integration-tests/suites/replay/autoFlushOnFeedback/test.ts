import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { getExpectedReplayEvent } from '../../../utils/replayEventTemplates';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

/*
 * In this test we want to verify that replay is frozen when the feedback widget opens and flushed on submission.
 * We emulate this by firing the feedback lifecycle events directly.
 */
sentryTest('replay is frozen on feedback open and flushed on submit', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);
  const replayEvent0 = getReplayEvent(await reqPromise0);
  expect(replayEvent0).toEqual(getExpectedReplayEvent());

  await page.locator('#something').click();
  await page.locator('#open').click();

  const isPaused = await page.evaluate(() => {
    // @ts-expect-error - Replay is not typed on window
    return window.Replay._replay.isPaused();
  });
  expect(isPaused).toBe(true);

  await page.locator('#submit').click();

  const replayEvent1 = getReplayEvent(await reqPromise1);
  const { breadcrumbs, ...replayEventWithoutBreadcrumbs } = replayEvent1;
  expect(replayEventWithoutBreadcrumbs).toEqual(getExpectedReplayEvent({ segment_id: 1, urls: [] }));
  expect(breadcrumbs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ category: 'ui.click', message: 'body > button#something' }),
      expect.objectContaining({ category: 'ui.click', message: 'body > button#open' }),
    ]),
  );

  await page.locator('#close').click();
  const isResumed = await page.evaluate(() => {
    // @ts-expect-error - Replay is not typed on window
    return !window.Replay._replay.isPaused();
  });
  expect(isResumed).toBe(true);
});
