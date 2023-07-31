import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';
import { shouldSkipReplayTest } from '../../../../utils/replayHelpers';

sentryTest('should load Sentry without Replay in ES5 mode', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForErrorRequestOnUrl(page, url);

  const eventData = envelopeRequestParser(req);

  expect(eventData.message).toBe('Test exception');

  const hasReplay = await page.evaluate("!!window.__SENTRY__.hub.getClient().getIntegrationById('Replay')");

  expect(hasReplay).toBe(false);
});
