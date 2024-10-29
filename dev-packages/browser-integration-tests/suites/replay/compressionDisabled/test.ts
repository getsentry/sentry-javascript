import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getExpectedReplayEvent } from '../../../utils/replayEventTemplates';
import {
  getFullRecordingSnapshots,
  getReplayEvent,
  replayEnvelopeIsCompressed,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

sentryTest(
  'replay recording should allow to disable compression',
  async ({ getLocalTestPath, page, forceFlushReplay }) => {
    if (shouldSkipReplayTest()) {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await forceFlushReplay();

    const req0 = await reqPromise0;

    const replayEvent0 = getReplayEvent(req0);
    expect(replayEvent0).toEqual(getExpectedReplayEvent());

    expect(replayEnvelopeIsCompressed(req0)).toEqual(false);

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
