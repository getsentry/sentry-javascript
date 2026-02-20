import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { getExpectedReplayEvent } from '../../../utils/replayEventTemplates';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('should capture replays (@sentry/browser export)', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);
  const replayEvent0 = getReplayEvent(await reqPromise0);

  await page.locator('button').click();
  const replayEvent1 = getReplayEvent(await reqPromise1);

  expect(replayEvent0).toBeDefined();
  expect(replayEvent0).toEqual(
    getExpectedReplayEvent({
      segment_id: 0,
    }),
  );

  expect(replayEvent1).toBeDefined();
  expect(replayEvent1).toEqual(
    getExpectedReplayEvent({
      segment_id: 1,
      urls: [],
    }),
  );
});
