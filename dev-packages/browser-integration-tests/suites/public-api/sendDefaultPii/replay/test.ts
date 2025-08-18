import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest(
  'sets sdk.settings.infer_ip to "auto" on replay events when sendDefaultPii: true',
  async ({ getLocalTestUrl, page, browserName }) => {
    // We only test this against the NPM package and replay bundles
    // and only on chromium as most performance entries are only available in chromium
    if (shouldSkipReplayTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);
    const replayEvent = getReplayEvent(await reqPromise0);

    expect(replayEvent.sdk?.settings?.infer_ip).toBe('auto');
  },
);
