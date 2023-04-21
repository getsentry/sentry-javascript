import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getExpectedReplayEvent } from '../../../utils/replayEventTemplates';
import {
  getFullRecordingSnapshots,
  getReplayEvent,
  getReplaySnapshot,
  normalize,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

// Session should expire after 2s - keep in sync with init.js
const SESSION_TIMEOUT = 2000;

sentryTest('handles an inactive session', async ({ getLocalTestPath, page, isReplayCapableBundle }) => {
  if (!isReplayCapableBundle()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  const req0 = await reqPromise0;

  const replayEvent0 = getReplayEvent(req0);
  expect(replayEvent0).toEqual(getExpectedReplayEvent({}));

  const fullSnapshots0 = getFullRecordingSnapshots(req0);
  expect(fullSnapshots0.length).toEqual(1);
  const stringifiedSnapshot = normalize(fullSnapshots0[0]);
  expect(stringifiedSnapshot).toMatchSnapshot('snapshot-0.json');

  await page.click('#button1');

  // We wait for another segment 0
  const reqPromise1 = waitForReplayRequest(page, 0);

  // Now we wait for the session timeout, nothing should be sent in the meanwhile
  await new Promise(resolve => setTimeout(resolve, SESSION_TIMEOUT));

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

  // Trigger an action, should re-start the recording
  await page.click('#button2');
  const req1 = await reqPromise1;

  const replay3 = await getReplaySnapshot(page);
  expect(replay3._isEnabled).toEqual(true);
  expect(replay3._isPaused).toEqual(false);

  const replayEvent1 = getReplayEvent(req1);
  expect(replayEvent1).toEqual(getExpectedReplayEvent({}));

  const fullSnapshots1 = getFullRecordingSnapshots(req1);
  expect(fullSnapshots1.length).toEqual(1);
  const stringifiedSnapshot1 = normalize(fullSnapshots1[0]);
  expect(stringifiedSnapshot1).toMatchSnapshot('snapshot-1.json');
});
