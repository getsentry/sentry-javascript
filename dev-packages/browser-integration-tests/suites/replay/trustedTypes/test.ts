import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { replayEnvelopeIsCompressed, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest(
  'compresses the recording on pages that enforce Trusted Types',
  async ({ getLocalTestUrl, page, forceFlushReplay }) => {
    sentryTest.skip(shouldSkipReplayTest());

    await page.addInitScript(() => {
      (window as any)._violations = [];
      document.addEventListener('securitypolicyviolation', event => {
        (window as any)._violations.push(`${event.violatedDirective}: ${event.sample}`);
      });
    });

    const reqPromise0 = waitForReplayRequest(page, 0);

    await page.goto(await getLocalTestUrl({ testDir: __dirname }));
    await forceFlushReplay();

    expect(replayEnvelopeIsCompressed(await reqPromise0)).toBe(true);
    expect(await page.evaluate(() => (window as any)._violations)).toEqual([]);
  },
);
