import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { expectedFetchPerformanceSpan, expectedXHRPerformanceSpan } from '../../../utils/replayEventTemplates';
import { getReplayRecordingContent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('replay recording should contain fetch request span', async ({ getLocalTestPath, page, browserName }) => {
  // Possibly related: https://github.com/microsoft/playwright/issues/11390
  if (shouldSkipReplayTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  await page.route('https://example.com', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'hello world',
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  await page.click('#go-background');
  const { performanceSpans: spans0 } = getReplayRecordingContent(await reqPromise0);

  const receivedResponse = page.waitForResponse('https://example.com');
  await page.click('#fetch');
  await receivedResponse;

  const { performanceSpans: spans1 } = getReplayRecordingContent(await reqPromise1);

  const performanceSpans = [...spans0, ...spans1];
  expect(performanceSpans).toContainEqual(expectedFetchPerformanceSpan);
});

sentryTest('replay recording should contain XHR request span', async ({ getLocalTestPath, page, browserName }) => {
  if (shouldSkipReplayTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  await page.route('https://example.com', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'hello world',
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  await page.click('#go-background');
  const { performanceSpans: spans0 } = getReplayRecordingContent(await reqPromise0);

  const receivedResponse = page.waitForResponse('https://example.com');
  await page.click('#xhr');
  await receivedResponse;

  const { performanceSpans: spans1 } = getReplayRecordingContent(await reqPromise1);

  const performanceSpans = [...spans0, ...spans1];

  expect(performanceSpans).toContainEqual(expectedXHRPerformanceSpan);
});
