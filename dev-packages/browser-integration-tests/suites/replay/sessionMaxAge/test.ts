import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getExpectedReplayEvent } from '../../../utils/replayEventTemplates';
import {
  getFullRecordingSnapshots,
  getReplayEvent,
  getReplaySnapshot,
  normalize,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

// Session should be max. 4s long
const MAX_REPLAY_DURATION = 4000;

/*
  The main difference between this and sessionExpiry test, is that here we wait for the overall time (4s)
  in multiple steps (2s, 2s) instead of waiting for the whole time at once (4s).
*/
sentryTest('handles session that exceeds max age', async ({ forceFlushReplay, getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);

  const replay0 = await getReplaySnapshot(page);
  // We use the `initialTimestamp` of the replay to do any time based calculations
  const startTimestamp = replay0._context.initialTimestamp;

  const req0 = await reqPromise0;

  const replayEvent0 = getReplayEvent(req0);
  expect(replayEvent0).toEqual(getExpectedReplayEvent({}));

  const fullSnapshots0 = getFullRecordingSnapshots(req0);
  expect(fullSnapshots0.length).toEqual(1);
  const stringifiedSnapshot = normalize(fullSnapshots0[0]);
  expect(stringifiedSnapshot).toMatchSnapshot('snapshot-0.json');

  // Wait again for a new segment 0 (=new session)
  const reqPromise2 = waitForReplayRequest(page, 0);

  // Wait for an incremental snapshot
  // Wait half of the session max age (after initial flush), but account for potentially slow runners
  const timePassed1 = Date.now() - startTimestamp;
  await new Promise(resolve => setTimeout(resolve, Math.max(MAX_REPLAY_DURATION / 2 - timePassed1, 0)));
  await page.locator('#button1').click();
  await forceFlushReplay();

  const req1 = await reqPromise1;
  const replayEvent1 = getReplayEvent(req1);

  expect(replayEvent1).toEqual(getExpectedReplayEvent({ segment_id: 1, urls: [] }));

  const replay1 = await getReplaySnapshot(page);
  const oldSessionId = replay1.session?.id;

  // Wait for session to expire
  const timePassed2 = Date.now() - startTimestamp;
  await new Promise(resolve => setTimeout(resolve, Math.max(MAX_REPLAY_DURATION - timePassed2, 0)));
  await page.locator('#button2').click();
  await forceFlushReplay();

  const req2 = await reqPromise2;
  const replay2 = await getReplaySnapshot(page);

  expect(replay2.session?.id).not.toEqual(oldSessionId);

  const replayEvent2 = getReplayEvent(req2);
  expect(replayEvent2).toEqual(getExpectedReplayEvent({}));

  const fullSnapshots2 = getFullRecordingSnapshots(req2);
  expect(fullSnapshots2.length).toEqual(1);
  const stringifiedSnapshot2 = normalize(fullSnapshots2[0]);
  expect(stringifiedSnapshot2).toMatchSnapshot('snapshot-2.json');
});
