import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getExpectedReplayEvent } from '../../../utils/replayEventTemplates';
import {
  getFullRecordingSnapshots,
  getReplayEvent,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

sentryTest('replay recording should be compressed with custom compressor', async ({ getLocalTestPath, page }) => {
  // Only run this for esm/cjs, as otherwise the pako import does not work
  const bundle = process.env.PW_BUNDLE || 'esm';
  if (shouldSkipReplayTest() || bundle.startsWith('bundle_') || bundle.startsWith('loader_')) {
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
  const replayEvent0 = getReplayEvent(await reqPromise0);
  expect(replayEvent0).toEqual(getExpectedReplayEvent());

  const snapshots = getFullRecordingSnapshots(await reqPromise0);
  expect(snapshots.length).toEqual(1);

  const stringifiedSnapshot = JSON.stringify(snapshots[0]);
  expect(stringifiedSnapshot).toContain('"tagName":"body"');
  expect(stringifiedSnapshot).toContain('"tagName":"html"');
  expect(stringifiedSnapshot).toContain('"tagName":"button"');
  expect(stringifiedSnapshot).toContain('"textContent":"*** ***"');
  expect(stringifiedSnapshot).toContain('"id":"go-background"');
});
