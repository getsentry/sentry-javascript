import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getReplaySnapshot } from '../../../utils/replayHelpers';

sentryTest('should not send replays if both sample rates are 0', async ({ getLocalTestPath, page }) => {
  // Replay bundles are es6 only
  if (process.env.PW_BUNDLE && process.env.PW_BUNDLE.startsWith('bundle_es5')) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    // This should never be called!
    expect(true).toBe(false);

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  await page.click('button');

  // This waitForTimeout call should be okay, as we're not checking for any requests after it
  await page.waitForTimeout(500);

  const replay = await getReplaySnapshot(page);

  expect(replay.session?.sampled).toBe(false);

  // Cannot wait on getFirstSentryEnvelopeRequest, as that never resolves
});
