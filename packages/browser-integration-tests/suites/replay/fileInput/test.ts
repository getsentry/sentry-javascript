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
  'should not capture file input mutations',
  async ({ forceFlushReplay, getLocalTestPath, page, browserName, isReplayCapableBundle }) => {
    // This seems to be flaky on webkit, so skipping there
    if (!isReplayCapableBundle() || browserName === 'webkit') {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, 1);

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

    await page.setInputFiles('#file-input', {
      name: 'file.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('this,is,test'),
    });

    await forceFlushReplay();

    const res1 = await reqPromise1;

    const snapshots = getIncrementalRecordingSnapshots(res1).filter(isInputMutation);

    expect(snapshots).toEqual([]);
  },
);
