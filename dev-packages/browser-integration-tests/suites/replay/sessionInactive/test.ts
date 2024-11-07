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

// Session should be paused after 2s - keep in sync with init.js
const SESSION_PAUSED = 2000;

sentryTest('handles an inactive session', async ({ getLocalTestPath, page, browserName }) => {
  // webkit is a bit flakey here, the ids are sometimes off by <number of total
  // nodes>, so seems like there is a race condition with checkout?
  if (shouldSkipReplayTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  const req0 = await reqPromise0;

  const replayEvent0 = getReplayEvent(req0);
  expect(replayEvent0).toEqual(getExpectedReplayEvent({}));

  const fullSnapshots0 = getFullRecordingSnapshots(req0);
  expect(fullSnapshots0.length).toEqual(1);
  const stringifiedSnapshot = normalize(fullSnapshots0[0]);
  expect(stringifiedSnapshot).toMatchSnapshot('snapshot-0.json');

  await page.locator('#button1').click();

  // Now we wait for the session timeout, nothing should be sent in the meanwhile
  await new Promise(resolve => setTimeout(resolve, SESSION_PAUSED));

  // nothing happened because no activity/inactivity was detected
  const replay = await getReplaySnapshot(page);
  expect(replay._isEnabled).toEqual(true);
  expect(replay._isPaused).toEqual(false);

  // Now we trigger a blur event, which should move the session to paused mode
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
  });

  const replay2 = await getReplaySnapshot(page);
  expect(replay2._isEnabled).toEqual(true);
  expect(replay2._isPaused).toEqual(true);

  // We wait for next segment to be sent once we resume the session
  const reqPromise1 = waitForReplayRequest(page);

  // Trigger an action, should resume the recording
  await page.locator('#button2').click();
  const req1 = await reqPromise1;

  const replay3 = await getReplaySnapshot(page);
  expect(replay3._isEnabled).toEqual(true);
  expect(replay3._isPaused).toEqual(false);

  const fullSnapshots1 = getFullRecordingSnapshots(req1);
  expect(fullSnapshots1.length).toEqual(1);
  const stringifiedSnapshot1 = normalize(fullSnapshots1[0]);
  expect(stringifiedSnapshot1).toMatchSnapshot('snapshot-1.json');
});
