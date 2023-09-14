import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplayRecordingContent, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest(
  'handles large mutations with default options',
  async ({ getLocalTestPath, page, forceFlushReplay, browserName }) => {
    if (shouldSkipReplayTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const reqPromise0 = waitForReplayRequest(page, 0);

    const url = await getLocalTestPath({ testDir: __dirname });

    const [, res0] = await Promise.all([page.goto(url), reqPromise0]);

    const reqPromise1 = waitForReplayRequest(page);

    const [, , res1] = await Promise.all([page.click('#button-add'), forceFlushReplay(), reqPromise1]);

    const reqPromise2 = waitForReplayRequest(page);

    const [, , res2] = await Promise.all([page.click('#button-modify'), forceFlushReplay(), reqPromise2]);

    const reqPromise3 = waitForReplayRequest(page);

    const [, , res3] = await Promise.all([page.click('#button-remove'), forceFlushReplay(), reqPromise3]);

    const replayData0 = getReplayRecordingContent(res0);
    const replayData1 = getReplayRecordingContent(res1);
    const replayData2 = getReplayRecordingContent(res2);
    const replayData3 = getReplayRecordingContent(res3);

    expect(replayData0.fullSnapshots.length).toBe(1);
    expect(replayData0.incrementalSnapshots.length).toBe(0);

    expect(replayData1.fullSnapshots.length).toBe(0);
    expect(replayData1.incrementalSnapshots.length).toBeGreaterThan(0);

    expect(replayData2.fullSnapshots.length).toBe(0);
    expect(replayData2.incrementalSnapshots.length).toBeGreaterThan(0);

    expect(replayData3.fullSnapshots.length).toBe(0);
    expect(replayData3.incrementalSnapshots.length).toBeGreaterThan(0);
  },
);
