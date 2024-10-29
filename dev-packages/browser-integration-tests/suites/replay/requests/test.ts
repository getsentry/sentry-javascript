import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { expectedFetchPerformanceSpan, expectedXHRPerformanceSpan } from '../../../utils/replayEventTemplates';
import { getReplayRecordingContent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('replay recording should contain fetch request span', async ({ getLocalTestPath, page, browserName }) => {
  // Possibly related: https://github.com/microsoft/playwright/issues/11390
  if (shouldSkipReplayTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  await page.route('https://example.com', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'hello world',
    });
  });

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);

  const url = await getLocalTestPath({ testDir: __dirname });

  const [req0] = await Promise.all([reqPromise0, page.goto(url), page.locator('#go-background').click()]);

  const { performanceSpans: spans0 } = getReplayRecordingContent(req0);

  await Promise.all([page.waitForResponse('https://example.com'), page.locator('#fetch').click()]);

  const { performanceSpans: spans1 } = getReplayRecordingContent(await reqPromise1);

  const performanceSpans = [...spans0, ...spans1];
  expect(performanceSpans).toContainEqual(expectedFetchPerformanceSpan);
});

sentryTest('replay recording should contain XHR request span', async ({ getLocalTestPath, page, browserName }) => {
  if (shouldSkipReplayTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  await page.route('https://example.com', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'hello world',
    });
  });

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);

  const url = await getLocalTestPath({ testDir: __dirname });

  const [req0] = await Promise.all([reqPromise0, page.goto(url), page.locator('#go-background').click()]);

  const { performanceSpans: spans0 } = getReplayRecordingContent(req0);

  await Promise.all([page.waitForResponse('https://example.com'), page.locator('#xhr').click()]);

  const { performanceSpans: spans1 } = getReplayRecordingContent(await reqPromise1);

  const performanceSpans = [...spans0, ...spans1];

  expect(performanceSpans).toContainEqual(expectedXHRPerformanceSpan);
});
