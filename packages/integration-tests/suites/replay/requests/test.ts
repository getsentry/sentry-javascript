import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { expectedFetchPerformanceSpan, expectedXHRPerformanceSpan } from '../../../utils/replayEventTemplates';
import { getReplayRecordingContent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('replay recording should contain fetch request span', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  // we're only interested in segment 1 which should contain the fetch span
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
  await page.click('#fetch');
  await page.click('#go-background');

  const { performanceSpans } = getReplayRecordingContent(await reqPromise1);

  expect(performanceSpans).toContainEqual(expectedFetchPerformanceSpan);
});

sentryTest('replay recording should contain XHR request span', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  // we're only interested in segment 1 which should contain the fetch span
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
  await page.click('#xhr');

  const { performanceSpans } = getReplayRecordingContent(await reqPromise1);

  expect(performanceSpans).toContainEqual(expectedXHRPerformanceSpan);
});
