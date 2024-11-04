import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest("doesn't send a standalone span envelope if SDK is disabled", async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  // @ts-expect-error this exists in the test init/subject
  await page.waitForFunction(() => !!window.spanEnded);
  await page.waitForTimeout(2000);

  // @ts-expect-error this exists in the test init
  const fetchCallCount = await page.evaluate(() => window.fetchCallCount);
  // We expect no fetch calls because the SDK is disabled
  expect(fetchCallCount).toBe(0);
});
