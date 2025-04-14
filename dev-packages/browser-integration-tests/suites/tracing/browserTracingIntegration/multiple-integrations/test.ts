import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('warns if multiple integrations are used', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const msgs: string[] = [];

  page.on('console', msg => {
    msgs.push(msg.text());
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  expect(msgs).toEqual(['Multiple browserTracingIntegration instances are not supported.']);
});
