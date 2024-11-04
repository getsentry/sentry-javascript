import { expect } from '@playwright/test';
import type { inputData } from '@sentry-internal/rrweb';
import { IncrementalSource } from '@sentry-internal/rrweb';

import { sentryTest } from '../../../utils/fixtures';
import type { IncrementalRecordingSnapshot } from '../../../utils/replayHelpers';
import {
  getFullRecordingSnapshots,
  getIncrementalRecordingSnapshots,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

function isInputMutation(
  snap: IncrementalRecordingSnapshot,
): snap is IncrementalRecordingSnapshot & { data: inputData } {
  return snap.data.source == IncrementalSource.Input;
}

sentryTest(
  'should mask input initial value and its changes from `maskAllInputs` and allow unmasked selector',
  async ({ browserName, forceFlushReplay, getLocalTestPath, page }) => {
    // TODO(replay): This is flakey on webkit (~1%) where we do not always get the latest mutation.
    if (shouldSkipReplayTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    // We want to ensure to check the correct event payloads
    let firstInputMutationSegmentId: number | undefined = undefined;
    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, (event, res) => {
      const check =
        firstInputMutationSegmentId === undefined && getIncrementalRecordingSnapshots(res).some(isInputMutation);

      if (check) {
        firstInputMutationSegmentId = event.segment_id;
      }

      return check;
    });
    const reqPromise2 = waitForReplayRequest(page, (event, res) => {
      return (
        typeof firstInputMutationSegmentId === 'number' &&
        firstInputMutationSegmentId < event.segment_id &&
        getIncrementalRecordingSnapshots(res).some(isInputMutation)
      );
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);

    const text = 'test';

    const [req0] = await Promise.all([reqPromise0, page.locator('#input').fill(text)]);
    await forceFlushReplay();

    const fullSnapshot = getFullRecordingSnapshots(req0);
    const stringifiedSnapshot = JSON.stringify(fullSnapshot);
    expect(stringifiedSnapshot.includes('Submit form')).toBe(false);
    expect(stringifiedSnapshot.includes('Unmasked button')).toBe(true);

    const [req1] = await Promise.all([reqPromise1, page.locator('#input-unmasked').fill(text)]);
    await forceFlushReplay();

    const snapshots = getIncrementalRecordingSnapshots(req1).filter(isInputMutation);
    const lastSnapshot = snapshots[snapshots.length - 1];
    expect(lastSnapshot.data.text).toBe('*'.repeat(text.length));

    const snapshots2 = getIncrementalRecordingSnapshots(await reqPromise2).filter(isInputMutation);
    const lastSnapshot2 = snapshots2[snapshots2.length - 1];
    expect(lastSnapshot2.data.text).toBe(text);
  },
);

sentryTest(
  'should mask textarea initial value and its changes from `maskAllInputs` and allow unmasked selector',
  async ({ browserName, forceFlushReplay, getLocalTestPath, page }) => {
    // TODO(replay): This is flakey on webkit (~1%) where we do not always get the latest mutation.
    if (shouldSkipReplayTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    // We want to ensure to check the correct event payloads
    let firstInputMutationSegmentId: number | undefined = undefined;
    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, (event, res) => {
      const check =
        firstInputMutationSegmentId === undefined && getIncrementalRecordingSnapshots(res).some(isInputMutation);

      if (check) {
        firstInputMutationSegmentId = event.segment_id;
      }

      return check;
    });
    const reqPromise2 = waitForReplayRequest(page, (event, res) => {
      return (
        typeof firstInputMutationSegmentId === 'number' &&
        firstInputMutationSegmentId < event.segment_id &&
        getIncrementalRecordingSnapshots(res).some(isInputMutation)
      );
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);

    const text = 'test';

    await Promise.all([reqPromise0, page.locator('#textarea').fill(text)]);
    await forceFlushReplay();

    const [req1] = await Promise.all([reqPromise1, page.locator('#textarea-unmasked').fill(text)]);
    await forceFlushReplay();

    const snapshots = getIncrementalRecordingSnapshots(req1).filter(isInputMutation);
    const lastSnapshot = snapshots[snapshots.length - 1];
    expect(lastSnapshot.data.text).toBe('*'.repeat(text.length));

    const snapshots2 = getIncrementalRecordingSnapshots(await reqPromise2).filter(isInputMutation);
    const lastSnapshot2 = snapshots2[snapshots2.length - 1];
    expect(lastSnapshot2.data.text).toBe(text);
  },
);
