import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import {
  collectReplayRequests,
  getReplayPerformanceSpans,
  shouldSkipReplayTest,
} from '../../../../../utils/replayHelpers';

sentryTest('captures correct timestamps', async ({ getLocalTestUrl, page, browserName }) => {
  // These are a bit flaky on non-chromium browsers
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('http://sentry-test.io/foo', route => {
    return route.fulfill({
      status: 200,
    });
  });

  await page.route('https://dsn.ingest.sentry.io/**/*', async route => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.xhr');
  });

  const url = await getLocalTestUrl({ testDir: __dirname, skipDsnRouteHandler: true });
  await page.goto(url);

  void page.evaluate(() => {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', 'http://sentry-test.io/foo');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Cache', 'no-cache');
    xhr.setRequestHeader('X-Test-Header', 'test-value');
    xhr.send();

    xhr.addEventListener('readystatechange', function () {
      if (xhr.readyState === 4) {
        // @ts-expect-error Sentry is a global
        setTimeout(() => Sentry.captureException('test error', 0));
      }
    });
  });

  const request = await requestPromise;
  const eventData = envelopeRequestParser(request);

  const { replayRecordingSnapshots } = await replayRequestPromise;
  const xhrSpan = getReplayPerformanceSpans(replayRecordingSnapshots).find(span => span.op === 'resource.xhr')!;

  expect(xhrSpan).toBeDefined();

  const { startTimestamp, endTimestamp } = xhrSpan;

  expect(startTimestamp).toEqual(expect.any(Number));
  expect(endTimestamp).toEqual(expect.any(Number));
  expect(endTimestamp).toBeGreaterThan(startTimestamp);

  expect(eventData!.breadcrumbs![0].timestamp).toBeGreaterThan(startTimestamp);
});
