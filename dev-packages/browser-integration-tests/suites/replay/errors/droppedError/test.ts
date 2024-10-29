import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser } from '../../../../utils/helpers';
import { getReplaySnapshot, isReplayEvent, shouldSkipReplayTest } from '../../../../utils/replayHelpers';

sentryTest(
  '[error-mode] should not start recording if an error occurred when the error was dropped',
  async ({ getLocalTestPath, page, forceFlushReplay }) => {
    if (shouldSkipReplayTest()) {
      sentryTest.skip();
    }

    let callsToSentry = 0;

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      const req = route.request();
      const event = envelopeRequestParser(req);

      if (isReplayEvent(event)) {
        callsToSentry++;
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname, skipDsnRouteHandler: true });

    await page.goto(url);
    await forceFlushReplay();
    expect(callsToSentry).toEqual(0);

    await page.locator('#error').click();

    await page.locator('#log').click();
    await forceFlushReplay();

    expect(callsToSentry).toEqual(0);

    const replay = await getReplaySnapshot(page);
    expect(replay.recordingMode).toBe('buffer');
  },
);
