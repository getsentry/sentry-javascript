import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import {
  collectReplayRequests,
  getReplayPerformanceSpans,
  shouldSkipReplayTest,
} from '../../../../../utils/replayHelpers';

sentryTest('captures response headers', async ({ getLocalTestUrl, page, browserName }) => {
  // These are a bit flaky on non-chromium browsers
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('http://sentry-test.io/foo', route => {
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Test-Header': 'test-value',
        'X-Other-Header': 'test-value-2',
        'access-control-expose-headers': '*',
      },
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.xhr');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  await page.evaluate(() => {
    const xhr = new XMLHttpRequest();

    xhr.open('GET', 'http://sentry-test.io/foo');
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
      method: 'GET',
      status_code: 200,
      url: 'http://sentry-test.io/foo',
    },
  });

  const { replayRecordingSnapshots } = await replayRequestPromise;
  expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.xhr')).toEqual([
    {
      data: {
        method: 'GET',
        statusCode: 200,
        response: {
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
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

sentryTest(
  'does not capture response headers if URL does not match',
  async ({ getLocalTestUrl, page, browserName }) => {
    // These are a bit flaky on non-chromium browsers
    if (shouldSkipReplayTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    await page.route('http://sentry-test.io/bar', route => {
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Test-Header': 'test-value',
          'X-Other-Header': 'test-value-2',
          'access-control-expose-headers': '*',
        },
      });
    });

    const requestPromise = waitForErrorRequest(page);
    const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
      return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.xhr');
    });

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    await page.evaluate(() => {
      const xhr = new XMLHttpRequest();

      xhr.open('GET', 'http://sentry-test.io/bar');
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
        method: 'GET',
        status_code: 200,
        url: 'http://sentry-test.io/bar',
      },
    });

    const { replayRecordingSnapshots } = await replayRequestPromise;
    expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.xhr')).toEqual([
      {
        data: {
          method: 'GET',
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
  },
);
