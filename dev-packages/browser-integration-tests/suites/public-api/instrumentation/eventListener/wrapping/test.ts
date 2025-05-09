import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';

sentryTest(
  'Event listener instrumentation should not wrap event listeners multiple times',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    const functionListenerStackHeights: number[] = [];
    const objectListenerStackHeights: number[] = [];

    await page.exposeFunction('reportFunctionListenerStackHeight', (height: number) => {
      functionListenerStackHeights.push(height);
    });

    await page.exposeFunction('reportObjectListenerStackHeight', (height: number) => {
      objectListenerStackHeights.push(height);
    });

    // Attach initial listeners
    await page.evaluate('window.attachListeners()');
    await page.evaluate('document.body.click()');

    await page.evaluate('window.attachListeners()');
    await page.evaluate('window.attachListeners()');
    await page.evaluate('window.attachListeners()');
    await page.evaluate('document.body.click()');

    expect(functionListenerStackHeights).toHaveLength(2);
    expect(objectListenerStackHeights).toHaveLength(2);

    // check if all error stack traces are the same height
    expect(functionListenerStackHeights.every((val, _i, arr) => val === arr[0])).toBeTruthy();
    expect(objectListenerStackHeights.every((val, _i, arr) => val === arr[0])).toBeTruthy();
  },
);
