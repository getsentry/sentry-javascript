import { expect, test } from '@playwright/test';

// This test verifies that a faulty configuration of `getInitialProps` in `_app` will not cause our
// auto - wrapping / instrumentation to throw an error.
// See `_app.tsx` for more information.

test('should not fail auto-wrapping when `getInitialProps` configuration is faulty.', async ({ page }) => {
  await page.goto('/misconfigured-_app-getInitialProps');

  const serverErrorText = await page.$('//*[contains(text(), "Internal Server Error")]');

  expect(serverErrorText).toBeFalsy();
});
