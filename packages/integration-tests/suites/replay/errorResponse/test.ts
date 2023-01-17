import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getReplaySnapshot } from '../../../utils/helpers';

sentryTest('errorResponse', async ({ getLocalTestPath, page }) => {
  // Currently bundle tests are not supported for replay
  if (process.env.PW_BUNDLE && process.env.PW_BUNDLE.startsWith('bundle_es5')) {
    sentryTest.skip();
  }

  let called = 0;

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    called++;

    return route.fulfill({
      status: 400,
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  await page.click('button');
  await page.waitForTimeout(300);

  expect(called).toBe(1);

  // Should immediately skip retrying and just cancel, no backoff
  await page.waitForTimeout(5001);

  expect(called).toBe(1);

  const replay = await getReplaySnapshot(page);

  // @ts-ignore private API
  expect(replay._isEnabled).toBe(false);
});
