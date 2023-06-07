import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplayRecordingContent, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest(
  'handles large mutations with default options',
  async ({ getLocalTestPath, page, forceFlushReplay, browserName }) => {
    if (shouldSkipReplayTest() || ['webkit', 'firefox'].includes(browserName)) {
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
    await forceFlushReplay();
    const res0 = await reqPromise0;

    const reqPromise1 = waitForReplayRequest(page, 2);

    void page.click('#button-add');
    await forceFlushReplay();
    const res1 = await reqPromise1;

    const reqPromise2 = waitForReplayRequest(page, 3);

    void page.click('#button-modify');
    await forceFlushReplay();
    const res2 = await reqPromise2;

    const reqPromise3 = waitForReplayRequest(page, 4);

    void page.click('#button-remove');
    await forceFlushReplay();
    const res3 = await reqPromise3;

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
