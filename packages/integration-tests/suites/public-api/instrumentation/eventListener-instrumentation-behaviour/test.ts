import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';

sentryTest('should attach the same event listener only once', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  const testCompletionPromise = new Promise<void>(resolve => {
    let eventListener1Calls = 0;
    let eventListener2Calls = 0;

    page.on('console', async msg => {
      const msgText = msg.text();

      if (msgText === 'eventListener1') {
        eventListener1Calls = eventListener1Calls + 1;
      } else if (msgText === 'eventListener2') {
        eventListener2Calls = eventListener2Calls + 1;
      } else if (msgText === 'done') {
        expect(eventListener1Calls).toBe(2);
        expect(eventListener2Calls).toBe(2);
        resolve();
      }
    });
  });

  // Trigger event listeners twice and signal completion afterwards
  await page.evaluate('document.body.click()');
  await page.evaluate('document.body.click()');
  await page.evaluate('console.log("done")');

  return testCompletionPromise;
});
