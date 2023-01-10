import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getReplaySnapshot } from '../../../utils/helpers';

sentryTest('sampling', async ({ getLocalTestPath, page }) => {
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
  await page.waitForTimeout(200);

  const replay = await getReplaySnapshot(page);

  expect(replay.session?.sampled).toBe(false);

  // Cannot wait on getFirstSentryEnvelopeRequest, as that never resolves
});
