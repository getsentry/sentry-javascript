import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplaySnapshot, shouldSkipReplayTest, waitForReplayRunning } from '../../../../utils/replayHelpers';

sentryTest(
  '[error-mode] should not flush if error event is ignored in beforeErrorSampling',
  async ({ getLocalTestPath, page, browserName, forceFlushReplay }) => {
    // Skipping this in webkit because it is flakey there
    if (shouldSkipReplayTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await waitForReplayRunning(page);

    await page.locator('#drop').click();
    await forceFlushReplay();

    expect(await getReplaySnapshot(page)).toEqual(
      expect.objectContaining({
        _isEnabled: true,
        _isPaused: false,
        recordingMode: 'buffer',
      }),
    );
  },
);
