import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import {
  collectReplayRequests,
  getReplayPerformanceSpans,
  shouldSkipReplayTest,
} from '../../../../../utils/replayHelpers';

sentryTest(
  'captures response size from Content-Length header if available',
  async ({ getLocalTestUrl, page, browserName }) => {
    // These are a bit flaky on non-chromium browsers
    if (shouldSkipReplayTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    await page.route('http://sentry-test.io/foo', route => {
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Length': '789',
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
        response_body_size: 789,
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
          request: {
            headers: {},
            _meta: {
              warnings: ['URL_SKIPPED'],
            },
          },
          response: {
            size: 789,
            headers: {},
            _meta: {
              warnings: ['URL_SKIPPED'],
            },
          },
        },
        description: 'http://sentry-test.io/foo',
        endTimestamp: expect.any(Number),
        op: 'resource.xhr',
        startTimestamp: expect.any(Number),
      },
    ]);
  },
);

sentryTest('captures response size without Content-Length header', async ({ getLocalTestUrl, page, browserName }) => {
  // These are a bit flaky on non-chromium browsers
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('http://sentry-test.io/foo', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        userNames: ['John', 'Jane'],
      }),
      headers: {
        'Content-Length': '',
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

  expect(eventData.breadcrumbs?.length).toBe(1);
  expect(eventData.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'xhr',
    type: 'http',
    data: {
      method: 'GET',
      response_body_size: 29,
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
        request: {
          headers: {},
          _meta: {
            warnings: ['URL_SKIPPED'],
          },
        },
        response: {
          size: 29,
          headers: {},
          _meta: {
            warnings: ['URL_SKIPPED'],
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

sentryTest('captures response size for non-string bodies', async ({ getLocalTestUrl, page, browserName }) => {
  // These are a bit flaky on non-chromium browsers
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('http://sentry-test.io/foo', async route => {
    return route.fulfill({
      status: 200,
      body: Buffer.from('<html>Hello world</html>'),
      headers: {
        'Content-Length': '',
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

    xhr.open('POST', 'http://sentry-test.io/foo');
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
      response_body_size: 24,
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
          headers: {},
          _meta: {
            warnings: ['URL_SKIPPED'],
          },
        },
        response: {
          size: 24,
          headers: {},
          _meta: {
            warnings: ['URL_SKIPPED'],
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
