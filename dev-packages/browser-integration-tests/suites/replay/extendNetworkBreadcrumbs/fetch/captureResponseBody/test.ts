import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import {
  collectReplayRequests,
  getReplayPerformanceSpans,
  shouldSkipReplayTest,
} from '../../../../../utils/replayHelpers';

sentryTest('captures text response body', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const additionalHeaders = browserName === 'webkit' ? { 'content-type': 'text/plain' } : undefined;

  await page.route('http://sentry-test.io/foo', route => {
    return route.fulfill({
      status: 200,
      body: 'response body',
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.fetch');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  await page.evaluate(() => {
    fetch('http://sentry-test.io/foo', {
      method: 'POST',
    }).then(() => {
      // @ts-expect-error Sentry is a global
      Sentry.captureException('test error');
    });
  });

  const request = await requestPromise;
  const eventData = envelopeRequestParser(request);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData?.breadcrumbs?.length).toBe(1);
  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'fetch',
    type: 'http',
    data: {
      method: 'POST',
      response_body_size: 13,
      status_code: 200,
      url: 'http://sentry-test.io/foo',
    },
  });

  const { replayRecordingSnapshots } = await replayRequestPromise;
  expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.fetch')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        response: {
          size: 13,
          headers: {
            'content-length': '13',
            ...additionalHeaders,
          },
          body: 'response body',
        },
      },
      description: 'http://sentry-test.io/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.fetch',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest('captures JSON response body', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const additionalHeaders = browserName === 'webkit' ? { 'content-type': 'text/plain' } : undefined;

  await page.route('http://sentry-test.io/foo', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({ res: 'this' }),
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.fetch');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  await page.evaluate(() => {
    fetch('http://sentry-test.io/foo', {
      method: 'POST',
    }).then(() => {
      // @ts-expect-error Sentry is a global
      Sentry.captureException('test error');
    });
  });

  const request = await requestPromise;
  const eventData = envelopeRequestParser(request);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData?.breadcrumbs?.length).toBe(1);
  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'fetch',
    type: 'http',
    data: {
      method: 'POST',
      response_body_size: 14,
      status_code: 200,
      url: 'http://sentry-test.io/foo',
    },
  });

  const { replayRecordingSnapshots } = await replayRequestPromise;
  expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.fetch')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        response: {
          size: 14,
          headers: {
            'content-length': '14',
            ...additionalHeaders,
          },
          body: { res: 'this' },
        },
      },
      description: 'http://sentry-test.io/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.fetch',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest('captures non-text response body', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const additionalHeaders = browserName === 'webkit' ? { 'content-type': 'application/octet-stream' } : {};

  await page.route('http://sentry-test.io/foo', route => {
    return route.fulfill({
      status: 200,
      body: Buffer.from('<html>Hello world</html>'),
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.fetch');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  await page.evaluate(() => {
    fetch('http://sentry-test.io/foo', {
      method: 'POST',
    }).then(() => {
      // @ts-expect-error Sentry is a global
      Sentry.captureException('test error');
    });
  });

  const request = await requestPromise;
  const eventData = envelopeRequestParser(request);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData?.breadcrumbs?.length).toBe(1);
  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'fetch',
    type: 'http',
    data: {
      method: 'POST',
      response_body_size: 24,
      status_code: 200,
      url: 'http://sentry-test.io/foo',
    },
  });

  const { replayRecordingSnapshots } = await replayRequestPromise;
  expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.fetch')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        response: {
          size: 24,
          headers: {
            'content-length': '24',
            ...additionalHeaders,
          },
          body: '<html>Hello world</html>',
        },
      },
      description: 'http://sentry-test.io/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.fetch',
      startTimestamp: expect.any(Number),
    },
  ]);
});

// This test is flaky
// See: https://github.com/getsentry/sentry-javascript/issues/11136
sentryTest.skip('does not capture response body when URL does not match', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test.io/bar', route => {
    return route.fulfill({
      status: 200,
      body: 'response body',
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.fetch');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  await page.evaluate(() => {
    fetch('http://sentry-test.io/bar', {
      method: 'POST',
    }).then(() => {
      // @ts-expect-error Sentry is a global
      Sentry.captureException('test error');
    });
  });

  const request = await requestPromise;
  const eventData = envelopeRequestParser(request);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData?.breadcrumbs?.length).toBe(1);
  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'fetch',
    type: 'http',
    data: {
      method: 'POST',
      response_body_size: 13,
      status_code: 200,
      url: 'http://sentry-test.io/bar',
    },
  });

  const { replayRecordingSnapshots } = await replayRequestPromise;
  expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.fetch')).toEqual([
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
          size: 13,
          headers: {},
          _meta: {
            warnings: ['URL_SKIPPED'],
          },
        },
      },
      description: 'http://sentry-test.io/bar',
      endTimestamp: expect.any(Number),
      op: 'resource.fetch',
      startTimestamp: expect.any(Number),
    },
  ]);
});
