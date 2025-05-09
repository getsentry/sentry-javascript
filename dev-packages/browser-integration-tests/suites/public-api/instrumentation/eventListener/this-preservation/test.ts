import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';

sentryTest('Event listener instrumentation preserves "this" context', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  let assertions = 0;

  await page.exposeFunction('functionCallback', (thisInstanceName: unknown) => {
    expect(thisInstanceName).toBe('HTMLButtonElement');
    assertions = assertions + 1;
  });

  await page.exposeFunction('classInstanceCallback', (thisInstanceName: unknown) => {
    expect(thisInstanceName).toBe('EventHandlerClass');
    assertions = assertions + 1;
  });

  await page.evaluate('document.getElementById("btn").click()');

  expect(assertions).toBe(2);
});
