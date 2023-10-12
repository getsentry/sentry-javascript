import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';

import { sentryTest } from '../../../utils/fixtures';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('exceptions within rrweb and re-thrown and annotated', async ({ getLocalTestPath, page, browserName}) => {
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  // const reqPromise0 = waitForReplayRequest(page, 0);
  // const reqPromise1 = waitForReplayRequest(page, 1);
  //
  // await page.route('https://dsn.ingest.sentry.io/**/*', route => {
  //   return route.fulfill({
  //     status: 200,
  //     contentType: 'application/json',
  //     body: JSON.stringify({ id: 'test-id' }),
  //   });
  // });
  //
  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);

expect(await page.evaluate(() => {
  try {
    const s = new CSSStyleSheet();
    s.insertRule('body::-ms-expand{display: none}');
    s.insertRule('body {background-color: #fff;}');
    return s.cssRules.length;
  } catch {
    return false;
  }
  })).toBe(false);

expect(await page.evaluate(() => {
    const s = new CSSStyleSheet();
    s.insertRule('body {background-color: #fff;}');
    return s.cssRules.length;
  })).toBe(1);
})
