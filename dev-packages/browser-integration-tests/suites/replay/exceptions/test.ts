import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipReplayTest } from '../../../utils/replayHelpers';

sentryTest('exceptions within rrweb and re-thrown and annotated', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  expect(
    await page.evaluate(() => {
      try {
        const s = new CSSStyleSheet();
        s.insertRule('body::-ms-expand{display: none}');
        s.insertRule('body {background-color: #fff;}');
        return s.cssRules.length;
      } catch {
        return false;
      }
    }),
  ).toBe(false);

  expect(
    await page.evaluate(() => {
      const s = new CSSStyleSheet();
      s.insertRule('body {background-color: #fff;}');
      return s.cssRules.length;
    }),
  ).toBe(1);
});
