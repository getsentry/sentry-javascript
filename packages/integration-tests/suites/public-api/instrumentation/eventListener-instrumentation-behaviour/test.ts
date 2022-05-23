import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';

sentryTest('should attach the same event listener only once', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  let testCallback1Calls = 0;
  await page.exposeFunction('testCallback1', () => {
    testCallback1Calls = testCallback1Calls + 1;
  });

  let testCallback2Calls = 0;
  await page.exposeFunction('testCallback2', () => {
    testCallback2Calls = testCallback2Calls + 1;
  });

  // Trigger event listeners twice
  await page.evaluate('document.body.click()');
  await page.evaluate('document.body.click()');

  expect(testCallback1Calls).toBe(2);
  expect(testCallback2Calls).toBe(2);
});
