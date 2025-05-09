import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';

sentryTest(
  'Event listener instrumentation should attach the same event listener only once',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    let functionListenerCalls = 0;
    await page.exposeFunction('functionListenerCallback', () => {
      functionListenerCalls = functionListenerCalls + 1;
    });

    let objectListenerCalls = 0;
    await page.exposeFunction('objectListenerCallback', () => {
      objectListenerCalls = objectListenerCalls + 1;
    });

    // Trigger event listeners twice
    await page.evaluate('document.body.click()');
    await page.evaluate('document.body.click()');

    expect(functionListenerCalls).toBe(2);
    expect(objectListenerCalls).toBe(2);
  },
);
