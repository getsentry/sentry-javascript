import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getExpectedReplayEvent } from '../../../utils/replayEventTemplates';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

const MIN_DURATION = 2000;

sentryTest('doest not send replay before min. duration', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  let counter = 0;
  const reqPromise0 = waitForReplayRequest(page, () => {
    counter++;
    return true;
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);

  // This triggers a page blur, which should trigger a flush
  // However, as we are only here too short, this should not actually _send_ anything
  await page.evaluate(`Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: function () {
    return 'hidden';
  },
});
document.dispatchEvent(new Event('visibilitychange'));`);
  expect(counter).toBe(0);

  // Now wait for 2s until min duration is reached, and try again
  await new Promise(resolve => setTimeout(resolve, MIN_DURATION + 100));
  await page.evaluate(`Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: function () {
      return 'visible';
    },
  });
  document.dispatchEvent(new Event('visibilitychange'));`);
  await page.evaluate(`Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: function () {
      return 'hidden';
    },
  });
  document.dispatchEvent(new Event('visibilitychange'));`);

  const replayEvent0 = getReplayEvent(await reqPromise0);
  expect(replayEvent0).toEqual(getExpectedReplayEvent({}));
  expect(counter).toBe(1);
});
