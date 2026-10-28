import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../utils/helpers';
import {
  getReplaySnapshot,
  shouldSkipReplayTest,
  waitForReplayRequest,
  waitForReplayRunning,
} from '../../../../utils/replayHelpers';

sentryTest(
  '[error-mode] should flush for captureMessage when attachStacktrace is explicitly enabled',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipReplayTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);
    await waitForReplayRunning(page);

    const errorRequestPromise = waitForErrorRequest(page);
    const replayRequestPromise = waitForReplayRequest(page, 0);
    await page.evaluate(() => (window as any).Sentry.captureMessage('Some message'));
    const event = envelopeRequestParser(await errorRequestPromise);
    await replayRequestPromise;

    expect(event.tags?.replayId).toEqual(expect.any(String));
    expect(await getReplaySnapshot(page)).toEqual(
      expect.objectContaining({
        recordingMode: 'session',
      }),
    );
  },
);
