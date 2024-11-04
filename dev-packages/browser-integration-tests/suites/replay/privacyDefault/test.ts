import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import {
  getFullRecordingSnapshots,
  normalize,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

sentryTest('should have the correct default privacy settings', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);

  const snapshots = getFullRecordingSnapshots(await reqPromise0);
  expect(snapshots.length).toEqual(1);

  const stringifiedSnapshot = normalize(snapshots[0], { normalizeNumberAttributes: ['rr_width', 'rr_height'] });

  expect(stringifiedSnapshot).toMatchSnapshot('privacy.json');
});
