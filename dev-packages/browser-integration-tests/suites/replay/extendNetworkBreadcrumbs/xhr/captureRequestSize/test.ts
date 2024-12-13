import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import {
  collectReplayRequests,
  getReplayPerformanceSpans,
  shouldSkipReplayTest,
} from '../../../../../utils/replayHelpers';

sentryTest('captures request body size when body is sent', async ({ getLocalTestUrl, page, browserName }) => {
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

  const [, request] = await Promise.all([
    page.evaluate(() => {
      const xhr = new XMLHttpRequest();

      xhr.open('POST', 'http://sentry-test.io/foo');
      xhr.send('{"foo":"bar"}');

      xhr.addEventListener('readystatechange', function () {
        if (xhr.readyState === 4) {
          // @ts-expect-error Sentry is a global
          setTimeout(() => Sentry.captureException('test error', 0));
        }
      });
    }),
    requestPromise,
  ]);

  const eventData = envelopeRequestParser(request);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData?.breadcrumbs?.length).toBe(1);
  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'xhr',
    type: 'http',
    data: {
      method: 'POST',
      request_body_size: 13,
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
          size: 13,
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
      description: 'http://sentry-test.io/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.xhr',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest('captures request size from non-text request body', async ({ getLocalTestUrl, page, browserName }) => {
  // These are a bit flaky on non-chromium browsers
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('**/foo', async route => {
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

  await page.evaluate(() => {
    const xhr = new XMLHttpRequest();

    const blob = new Blob(['<html>Hello world!!</html>'], { type: 'text/html' });

    xhr.open('POST', 'http://sentry-test.io/foo');
    xhr.send(blob);

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
      request_body_size: 26,
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
          size: 26,
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
      description: 'http://sentry-test.io/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.xhr',
      startTimestamp: expect.any(Number),
    },
  ]);
});
