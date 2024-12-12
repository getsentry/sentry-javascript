import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import {
  collectReplayRequests,
  getReplayPerformanceSpans,
  shouldSkipReplayTest,
} from '../../../../../utils/replayHelpers';

sentryTest('captures request headers', async ({ getLocalTestUrl, page, browserName }) => {
  // These are a bit flaky on non-chromium browsers
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('http://sentry-test.io/foo', route => {
    return route.fulfill({
      status: 200,
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.xhr');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
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

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData?.breadcrumbs?.length).toBe(1);
  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'xhr',
    type: 'http',
    data: {
      method: 'POST',
      status_code: 200,
      url: 'http://sentry-test.io/foo',
    },
  });

  const { replayRecordingSnapshots } = await replayRequestPromise;
  expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.xhr')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        request: {
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'x-test-header': 'test-value',
          },
        },
      },
      description: 'http://sentry-test.io/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.xhr',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest('does not capture request headers if URL does not match', async ({ getLocalTestUrl, page, browserName }) => {
  // These are a bit flaky on non-chromium browsers
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('http://sentry-test.io/bar', route => {
    return route.fulfill({
      status: 200,
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.xhr');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  void page.evaluate(() => {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', 'http://sentry-test.io/bar');
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

  const [request] = await Promise.all([requestPromise]);

  const eventData = envelopeRequestParser(request);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData?.breadcrumbs?.length).toBe(1);
  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'xhr',
    type: 'http',
    data: {
      method: 'POST',
      status_code: 200,
      url: 'http://sentry-test.io/bar',
    },
  });

  const { replayRecordingSnapshots } = await replayRequestPromise;
  expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.xhr')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        request: {
          headers: {},
          _meta: {
            warnings: ['URL_SKIPPED'],
          },
        },
        response: {
          headers: {},
          _meta: {
            warnings: ['URL_SKIPPED'],
          },
        },
      },
      description: 'http://sentry-test.io/bar',
      endTimestamp: expect.any(Number),
      op: 'resource.xhr',
      startTimestamp: expect.any(Number),
    },
  ]);
});
