import { expect } from '@playwright/test';
import { IncrementalSource } from '@sentry-internal/rrweb';
import type { inputData } from '@sentry-internal/rrweb/typings/types';

import { sentryTest } from '../../../utils/fixtures';
import type { IncrementalRecordingSnapshot } from '../../../utils/replayHelpers';
import { getIncrementalRecordingSnapshots, waitForReplayRequest } from '../../../utils/replayHelpers';

function isInputMutation(
  snap: IncrementalRecordingSnapshot,
): snap is IncrementalRecordingSnapshot & { data: inputData } {
  return snap.data.source == IncrementalSource.Input;
}

sentryTest(
  'should mask input initial value and its changes',
  async ({ browserName, forceFlushReplay, getLocalTestPath, page, isReplayCapableBundle }) => {
    // TODO(replay): This is flakey on firefox and webkit (~1%) where we do not always get the latest mutation.
    if (!isReplayCapableBundle() || ['firefox', 'webkit'].includes(browserName)) {
      sentryTest.skip();
    }

    // We want to ensure to check the correct event payloads
    const inputMutationSegmentIds: number[] = [];
    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, (event, res) => {
      const check = inputMutationSegmentIds.length === 0 && getIncrementalRecordingSnapshots(res).some(isInputMutation);

      if (check) {
        inputMutationSegmentIds.push(event.segment_id);
      }

      return check;
    });
    const reqPromise2 = waitForReplayRequest(page, (event, res) => {
      const check =
        inputMutationSegmentIds.length === 1 &&
        inputMutationSegmentIds[0] < event.segment_id &&
        getIncrementalRecordingSnapshots(res).some(isInputMutation);

      if (check) {
        inputMutationSegmentIds.push(event.segment_id);
      }

      return check;
    });
    const reqPromise3 = waitForReplayRequest(page, event => {
      // This one should not have any input mutations
      return inputMutationSegmentIds.length === 2 && inputMutationSegmentIds[1] < event.segment_id;
    });

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);

    await reqPromise0;

    const text = 'test';

    await page.locator('#input').fill(text);
    await forceFlushReplay();
    const snapshots = getIncrementalRecordingSnapshots(await reqPromise1).filter(isInputMutation);
    const lastSnapshot = snapshots[snapshots.length - 1];
    expect(lastSnapshot.data.text).toBe(text);

    await page.locator('#input-masked').fill(text);
    await forceFlushReplay();
    const snapshots2 = getIncrementalRecordingSnapshots(await reqPromise2).filter(isInputMutation);
    const lastSnapshot2 = snapshots2[snapshots2.length - 1];
    expect(lastSnapshot2.data.text).toBe('*'.repeat(text.length));

    await page.locator('#input-ignore').fill(text);
    await forceFlushReplay();
    const snapshots3 = getIncrementalRecordingSnapshots(await reqPromise3).filter(isInputMutation);
    expect(snapshots3.length).toBe(0);
  },
);

sentryTest(
  'should mask textarea initial value and its changes',
  async ({ browserName, forceFlushReplay, getLocalTestPath, page, isReplayCapableBundle }) => {
    // TODO(replay): This is flakey on firefox and webkit (~1%) where we do not always get the latest mutation.
    if (!isReplayCapableBundle() || ['firefox', 'webkit'].includes(browserName)) {
      sentryTest.skip();
    }

    // We want to ensure to check the correct event payloads
    const inputMutationSegmentIds: number[] = [];
    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, (event, res) => {
      const check = inputMutationSegmentIds.length === 0 && getIncrementalRecordingSnapshots(res).some(isInputMutation);

      if (check) {
        inputMutationSegmentIds.push(event.segment_id);
      }

      return check;
    });
    const reqPromise2 = waitForReplayRequest(page, (event, res) => {
      const check =
        inputMutationSegmentIds.length === 1 &&
        inputMutationSegmentIds[0] < event.segment_id &&
        getIncrementalRecordingSnapshots(res).some(isInputMutation);

      if (check) {
        inputMutationSegmentIds.push(event.segment_id);
      }

      return check;
    });
    const reqPromise3 = waitForReplayRequest(page, event => {
      // This one should not have any input mutations
      return inputMutationSegmentIds.length === 2 && inputMutationSegmentIds[1] < event.segment_id;
    });

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await reqPromise0;

    const text = 'test';
    await page.locator('#textarea').fill(text);
    await forceFlushReplay();
    const snapshots = getIncrementalRecordingSnapshots(await reqPromise1).filter(isInputMutation);
    const lastSnapshot = snapshots[snapshots.length - 1];
    expect(lastSnapshot.data.text).toBe(text);

    await page.locator('#textarea-masked').fill(text);
    await forceFlushReplay();
    const snapshots2 = getIncrementalRecordingSnapshots(await reqPromise2).filter(isInputMutation);
    const lastSnapshot2 = snapshots2[snapshots2.length - 1];
    expect(lastSnapshot2.data.text).toBe('*'.repeat(text.length));

    await page.locator('#textarea-ignore').fill(text);
    await forceFlushReplay();
    const snapshots3 = getIncrementalRecordingSnapshots(await reqPromise3).filter(isInputMutation);
    expect(snapshots3.length).toBe(0);
  },
);
