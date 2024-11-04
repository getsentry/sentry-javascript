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
    if (shouldSkipReplayTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    // We have to click in order to ensure the LCP is generated, leading to consistent results
    async function gotoPageAndClick() {
      await page.goto(url);
      await page.locator('#noop').click();
    }

    const [res0] = await Promise.all([waitForReplayRequest(page, 0), gotoPageAndClick()]);
    await forceFlushReplay();

    const [res1] = await Promise.all([
      waitForReplayRequest(page, (_event, res) => {
        const parsed = getReplayRecordingContent(res);
        return !!parsed.incrementalSnapshots.length || !!parsed.fullSnapshots.length;
      }),
      page.locator('#button-add').click(),
      forceFlushReplay(),
    ]);

    // replay should be stopped due to mutation limit
    let replay = await getReplaySnapshot(page);
    expect(replay.session).toBe(undefined);
    expect(replay._isEnabled).toBe(false);

    await page.locator('#button-modify').click();
    await forceFlushReplay();

    await page.locator('#button-remove').click();
    await forceFlushReplay();

    const replayData0 = getReplayRecordingContent(res0);
    expect(replayData0.fullSnapshots.length).toBe(1);

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
