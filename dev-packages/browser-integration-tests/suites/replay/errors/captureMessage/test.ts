import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../utils/helpers';
import { getReplaySnapshot, shouldSkipReplayTest, waitForReplayRunning } from '../../../../utils/replayHelpers';

sentryTest(
  '[error-mode] should not flush for captureMessage when attachStacktrace is left at its default',
  async ({ getLocalTestUrl, page, forceFlushReplay }) => {
    if (shouldSkipReplayTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);
    await waitForReplayRunning(page);

    const errorRequestPromise = waitForErrorRequest(page);
    await page.evaluate(() => (window as any).Sentry.captureMessage('Some message'));
    const event = envelopeRequestParser(await errorRequestPromise);
    await forceFlushReplay();

    expect(event.exception?.values?.[0]?.stacktrace?.frames?.length).toBeGreaterThan(0);
    expect(event.tags?.replayId).toBeUndefined();
    expect(await getReplaySnapshot(page)).toEqual(
      expect.objectContaining({
        _isEnabled: true,
        _isPaused: false,
        recordingMode: 'buffer',
      }),
    );
  },
);
