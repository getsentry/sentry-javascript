import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import {
  getReplayRecordingContent,
  getReplaySnapshot,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../../utils/replayHelpers';

sentryTest(
  'handles large mutations by stopping replay when `mutationLimit` configured',
  async ({ getLocalTestPath, page, forceFlushReplay, browserName }) => {
    if (shouldSkipReplayTest() || ['webkit', 'firefox'].includes(browserName)) {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise0b = waitForReplayRequest(page, 1);

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    const res0 = await reqPromise0;
    await reqPromise0b;
    // A second request is sent right after initial snapshot, we want to wait for that to settle before we continue

    const reqPromise1 = waitForReplayRequest(page);

    void page.click('#button-add');
    await forceFlushReplay();
    const res1 = await reqPromise1;

    // replay should be stopped due to mutation limit
    let replay = await getReplaySnapshot(page);
    expect(replay.session).toBe(undefined);
    expect(replay._isEnabled).toBe(false);

    void page.click('#button-modify');
    await forceFlushReplay();

    await page.click('#button-remove');
    await forceFlushReplay();

    const replayData0 = getReplayRecordingContent(res0);
    expect(replayData0.fullSnapshots.length).toBe(1);
    expect(replayData0.incrementalSnapshots.length).toBe(0);

    // Breadcrumbs (click and mutation);
    const replayData1 = getReplayRecordingContent(res1);
    expect(replayData1.fullSnapshots.length).toBe(0);
    expect(replayData1.incrementalSnapshots.length).toBeGreaterThan(0);
    expect(replayData1.breadcrumbs.map(({ category }) => category).sort()).toEqual(['replay.mutations', 'ui.click']);

    replay = await getReplaySnapshot(page);
    expect(replay.session).toBe(undefined);
    expect(replay._isEnabled).toBe(false);
  },
);
