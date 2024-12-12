import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import {
  collectReplayRequests,
  getReplayPerformanceSpans,
  shouldSkipReplayTest,
} from '../../../../../utils/replayHelpers';

sentryTest('handles empty/missing request headers', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const additionalHeaders = browserName === 'webkit' ? { 'content-type': 'text/plain' } : undefined;

  await page.route('http://sentry-test.io/foo', route => {
    return route.fulfill({
      status: 200,
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.fetch');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const [, request, { replayRecordingSnapshots }] = await Promise.all([
    page.evaluate(() => {
      fetch('http://sentry-test.io/foo', {
        method: 'POST',
      }).then(() => {
        // @ts-expect-error Sentry is a global
        Sentry.captureException('test error');
      });
    }),
    requestPromise,
    replayRequestPromise,
  ]);

  const eventData = envelopeRequestParser(request);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData?.breadcrumbs?.length).toBe(1);
  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'fetch',
    type: 'http',
    data: {
      method: 'POST',
      status_code: 200,
      url: 'http://sentry-test.io/foo',
    },
  });

  expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.fetch')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        response: additionalHeaders ? { headers: additionalHeaders } : undefined,
      },
      description: 'http://sentry-test.io/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.fetch',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest('captures request headers as POJO', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const additionalHeaders = browserName === 'webkit' ? { 'content-type': 'text/plain' } : undefined;

  await page.route('http://sentry-test.io/foo', route => {
    return route.fulfill({
      status: 200,
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.fetch');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const [, request, { replayRecordingSnapshots }] = await Promise.all([
    page.evaluate(() => {
      fetch('http://sentry-test.io/foo', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Cache: 'no-cache',
          'X-Custom-Header': 'foo',
          'X-Test-Header': 'test-value',
        },
      }).then(() => {
        // @ts-expect-error Sentry is a global
        Sentry.captureException('test error');
      });
    }),
    requestPromise,
    replayRequestPromise,
  ]);

  const eventData = envelopeRequestParser(request);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData?.breadcrumbs?.length).toBe(1);
  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'fetch',
    type: 'http',
    data: {
      method: 'POST',
      status_code: 200,
      url: 'http://sentry-test.io/foo',
    },
  });

  expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.fetch')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        request: {
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-test-header': 'test-value',
          },
        },
        response: additionalHeaders ? { headers: additionalHeaders } : undefined,
      },
      description: 'http://sentry-test.io/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.fetch',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest('captures request headers on Request', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const additionalHeaders = browserName === 'webkit' ? { 'content-type': 'text/plain' } : undefined;

  await page.route('http://sentry-test.io/foo', route => {
    return route.fulfill({
      status: 200,
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.fetch');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const [, request, { replayRecordingSnapshots }] = await Promise.all([
    page.evaluate(() => {
      const request = new Request('http://sentry-test.io/foo', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Cache: 'no-cache',
          'X-Custom-Header': 'foo',
        },
      });

      fetch(request).then(() => {
        // @ts-expect-error Sentry is a global
        Sentry.captureException('test error');
      });
    }),
    requestPromise,
    replayRequestPromise,
  ]);

  const eventData = envelopeRequestParser(request);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData?.breadcrumbs?.length).toBe(1);
  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'fetch',
    type: 'http',
    data: {
      method: 'POST',
      status_code: 200,
      url: 'http://sentry-test.io/foo',
    },
  });

  expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.fetch')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        request: {
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
        },
        response: additionalHeaders ? { headers: additionalHeaders } : undefined,
      },
      description: 'http://sentry-test.io/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.fetch',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest('captures request headers as Headers instance', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const additionalHeaders = browserName === 'webkit' ? { 'content-type': 'text/plain' } : undefined;

  await page.route('http://sentry-test.io/foo', route => {
    return route.fulfill({
      status: 200,
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.fetch');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const [, request, { replayRecordingSnapshots }] = await Promise.all([
    page.evaluate(() => {
      const headers = new Headers();
      headers.append('Accept', 'application/json');
      headers.append('Content-Type', 'application/json');
      headers.append('Cache', 'no-cache');
      headers.append('X-Custom-Header', 'foo');

      fetch('http://sentry-test.io/foo', {
        method: 'POST',
        headers,
      }).then(() => {
        // @ts-expect-error Sentry is a global
        Sentry.captureException('test error');
      });
    }),
    requestPromise,
    replayRequestPromise,
  ]);

  const eventData = envelopeRequestParser(request);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData?.breadcrumbs?.length).toBe(1);
  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'fetch',
    type: 'http',
    data: {
      method: 'POST',
      status_code: 200,
      url: 'http://sentry-test.io/foo',
    },
  });

  expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.fetch')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        request: {
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
        },
        response: additionalHeaders ? { headers: additionalHeaders } : undefined,
      },
      description: 'http://sentry-test.io/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.fetch',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest('does not captures request headers if URL does not match', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test.io/bar', route => {
    return route.fulfill({
      status: 200,
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.fetch');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const [, request, { replayRecordingSnapshots }] = await Promise.all([
    page.evaluate(() => {
      fetch('http://sentry-test.io/bar', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Cache: 'no-cache',
          'X-Custom-Header': 'foo',
          'X-Test-Header': 'test-value',
        },
      }).then(() => {
        // @ts-expect-error Sentry is a global
        Sentry.captureException('test error');
      });
    }),
    requestPromise,
    replayRequestPromise,
  ]);

  const eventData = envelopeRequestParser(request);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData?.breadcrumbs?.length).toBe(1);
  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'fetch',
    type: 'http',
    data: {
      method: 'POST',
      status_code: 200,
      url: 'http://sentry-test.io/bar',
    },
  });

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
