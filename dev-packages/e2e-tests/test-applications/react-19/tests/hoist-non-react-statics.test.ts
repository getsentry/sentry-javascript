import { expect, test } from '@playwright/test';

test('withProfiler does not throw Symbol conversion error when String() is patched to simulate minifier', async ({
  page,
}) => {
  const errors: string[] = [];

  // Listen for any page errors (including the Symbol conversion error)
  page.on('pageerror', error => {
    errors.push(error.message);
  });

  // Listen for console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.addInitScript(() => {
    const OriginalString = String;
    // @ts-expect-error - intentionally replacing String to simulate minifier behavior
    window.String = function (value: unknown) {
      if (typeof value === 'symbol') {
        throw new TypeError('Cannot convert a Symbol value to a string');
      }
      return OriginalString(value);
    } as StringConstructor;

    Object.setPrototypeOf(window.String, OriginalString);
    window.String.prototype = OriginalString.prototype;
    window.String.fromCharCode = OriginalString.fromCharCode;
    window.String.fromCodePoint = OriginalString.fromCodePoint;
    window.String.raw = OriginalString.raw;
  });

  await page.goto('/');

  const profilerTest = page.locator('#profiler-test');
  await expect(profilerTest).toBeVisible();
  await expect(profilerTest).toHaveText('withProfiler works');

  const symbolErrors = errors.filter(e => e.includes('Cannot convert a Symbol value to a string'));
  expect(symbolErrors).toHaveLength(0);
});
