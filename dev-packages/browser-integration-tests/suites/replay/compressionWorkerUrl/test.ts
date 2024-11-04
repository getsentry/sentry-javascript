import fs from 'fs';
import path from 'path';
import { expect } from '@playwright/test';

import { TEST_HOST, sentryTest } from '../../../utils/fixtures';
import { getExpectedReplayEvent } from '../../../utils/replayEventTemplates';
import {
  getFullRecordingSnapshots,
  getReplayEvent,
  replayEnvelopeIsCompressed,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

sentryTest(
  'replay recording should be compressed if using custom workerUrl',
  async ({ getLocalTestUrl, page, forceFlushReplay }) => {
    if (shouldSkipReplayTest()) {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);

    const url = await getLocalTestUrl({ testDir: __dirname });

    let customCompressCalled = 0;

    // Ensure to register this _after_ getLocalTestUrl is called, as that also registers a default route for TEST_HOST
    await page.route(`${TEST_HOST}/my-test-worker.js`, route => {
      const filePath = path.resolve(__dirname, '../../../../../packages/replay-worker/examples/worker.min.js');

      customCompressCalled++;

      return fs.existsSync(filePath) ? route.fulfill({ path: filePath }) : route.continue();
    });

    await page.goto(url);
    await forceFlushReplay();

    const req0 = await reqPromise0;

    const replayEvent0 = getReplayEvent(req0);
    expect(replayEvent0).toEqual(getExpectedReplayEvent());

    expect(replayEnvelopeIsCompressed(req0)).toEqual(true);
    expect(customCompressCalled).toBe(1);

    const snapshots = getFullRecordingSnapshots(req0);
    expect(snapshots.length).toEqual(1);

    const stringifiedSnapshot = JSON.stringify(snapshots[0]);
    expect(stringifiedSnapshot).toContain('"tagName":"body"');
    expect(stringifiedSnapshot).toContain('"tagName":"html"');
    expect(stringifiedSnapshot).toContain('"tagName":"button"');
    expect(stringifiedSnapshot).toContain('"textContent":"*** ***"');
    expect(stringifiedSnapshot).toContain('"id":"go-background"');
  },
);
