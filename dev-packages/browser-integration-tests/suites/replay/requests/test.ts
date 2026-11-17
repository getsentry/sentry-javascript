import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { expectedFetchPerformanceSpan, expectedXHRPerformanceSpan } from '../../../utils/replayEventTemplates';
import { collectReplayRequests, getReplayPerformanceSpans, shouldSkipReplayTest } from '../../../utils/replayHelpers';

sentryTest('replay recording should contain fetch request span', async ({ getLocalTestUrl, page, browserName }) => {
  // Possibly related: https://github.com/microsoft/playwright/issues/11390
  if (shouldSkipReplayTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  await page.route('https://sentry-test-site.example', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'hello world',
    });
  });

  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.fetch');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);
  await page.locator('#go-background').click();

  await Promise.all([page.waitForResponse('https://sentry-test-site.example'), page.locator('#fetch').click()]);

  const { replayRecordingSnapshots } = await replayRequestPromise;
  const requestSpans = getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.fetch');
  expect(requestSpans).toEqual([expectedFetchPerformanceSpan]);
});

sentryTest('replay recording should contain XHR request span', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipReplayTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  await page.route('https://sentry-test-site.example', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'hello world',
    });
  });

  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.xhr');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);
  await page.locator('#go-background').click();

  await Promise.all([page.waitForResponse('https://sentry-test-site.example'), page.locator('#xhr').click()]);

  const { replayRecordingSnapshots } = await replayRequestPromise;
  const requestSpans = getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.xhr');
  expect(requestSpans).toEqual([expectedXHRPerformanceSpan]);
});
