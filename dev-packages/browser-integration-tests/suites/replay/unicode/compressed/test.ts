import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import {
  getFullRecordingSnapshots,
  normalize,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../../utils/replayHelpers';

sentryTest('replay should handle unicode characters', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
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
  const snapshots = getFullRecordingSnapshots(await reqPromise0);

  expect(snapshots.length).toEqual(1);
  expect(normalize(snapshots[0])).toMatchSnapshot('unicode-compressed.json');
});
