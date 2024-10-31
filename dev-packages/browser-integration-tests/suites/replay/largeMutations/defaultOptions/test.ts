import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplayRecordingContent, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest(
  'handles large mutations with default options',
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

    const [res2] = await Promise.all([
      waitForReplayRequest(page, (_event, res) => {
        const parsed = getReplayRecordingContent(res);
        return !!parsed.incrementalSnapshots.length || !!parsed.fullSnapshots.length;
      }),
      page.locator('#button-modify').click(),
      forceFlushReplay(),
    ]);

    const [res3] = await Promise.all([
      waitForReplayRequest(page, (_event, res) => {
        const parsed = getReplayRecordingContent(res);
        return !!parsed.incrementalSnapshots.length || !!parsed.fullSnapshots.length;
      }),
      page.locator('#button-remove').click(),
      forceFlushReplay(),
    ]);

    const replayData0 = getReplayRecordingContent(res0);
    const replayData1 = getReplayRecordingContent(res1);
    const replayData2 = getReplayRecordingContent(res2);
    const replayData3 = getReplayRecordingContent(res3);

    expect(replayData0.fullSnapshots.length).toBe(1);

    expect(replayData1.fullSnapshots.length).toBe(0);
    expect(replayData1.incrementalSnapshots.length).toBeGreaterThan(0);

    expect(replayData2.fullSnapshots.length).toBe(0);
    expect(replayData2.incrementalSnapshots.length).toBeGreaterThan(0);

    expect(replayData3.fullSnapshots.length).toBe(0);
    expect(replayData3.incrementalSnapshots.length).toBeGreaterThan(0);
  },
);
