import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import {
  getReplaySnapshot,
  shouldSkipReplayTest,
  waitForReplayRequest,
  waitForReplayRunning,
} from '../../../utils/replayHelpers';

sentryTest('continues buffer session in session mode after error & reload', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise1 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);

  // buffer session captures an error & switches to session mode
  await page.locator('#buttonError').click();
  await new Promise(resolve => setTimeout(resolve, 300));
  await reqPromise1;

  await waitForReplayRunning(page);
  const replay1 = await getReplaySnapshot(page);

  expect(replay1.recordingMode).toEqual('session');
  expect(replay1.session?.sampled).toEqual('buffer');
  expect(replay1.session?.segmentId).toBeGreaterThan(0);

  // Reload to ensure the session is correctly recovered from sessionStorage
  await page.reload();

  await waitForReplayRunning(page);
  const replay2 = await getReplaySnapshot(page);

  expect(replay2.recordingMode).toEqual('session');
  expect(replay2.session?.sampled).toEqual('buffer');
  expect(replay2.session?.segmentId).toBeGreaterThan(0);
});
