import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import {
  collectReplayRequests,
  getReplayPerformanceSpans,
  shouldSkipReplayTest,
} from '../../../../../utils/replayHelpers';

sentryTest('captures text request body', async ({ getLocalTestUrl, page, browserName }) => {
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

  await page.evaluate(() => {
    fetch('http://sentry-test.io/foo', {
      method: 'POST',
      body: 'input body',
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
      request_body_size: 10,
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
        request: {
          size: 10,
          headers: {},
          body: 'input body',
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

sentryTest('captures JSON request body', async ({ getLocalTestUrl, page, browserName }) => {
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

  await page.evaluate(() => {
    fetch('http://sentry-test.io/foo', {
      method: 'POST',
      body: '{"foo":"bar"}',
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
      request_body_size: 13,
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
        request: {
          size: 13,
          headers: {},
          body: { foo: 'bar' },
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

sentryTest('captures non-text request body', async ({ getLocalTestUrl, page, browserName }) => {
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

  await page.evaluate(() => {
    const body = new URLSearchParams();
    body.append('name', 'Anne');
    body.append('age', '32');

    fetch('http://sentry-test.io/foo', {
      method: 'POST',
      body: body,
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
      request_body_size: 16,
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
        request: {
          size: 16,
          headers: {},
          body: 'name=Anne&age=32',
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

sentryTest('captures text request body when matching relative URL', async ({ getLocalTestUrl, page, browserName }) => {
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

  await page.evaluate(() => {
    fetch('/foo', {
      method: 'POST',
      body: 'input body',
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
      request_body_size: 10,
      status_code: 200,
      url: '/foo',
    },
  });

  const { replayRecordingSnapshots } = await replayRequestPromise;
  expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.fetch')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        request: {
          size: 10,
          headers: {},
          body: 'input body',
        },
        response: additionalHeaders ? { headers: additionalHeaders } : undefined,
      },
      description: '/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.fetch',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest('does not capture request body when URL does not match', async ({ getLocalTestUrl, page }) => {
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

  await page.evaluate(() => {
    fetch('http://sentry-test.io/bar', {
      method: 'POST',
      body: 'input body',
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
      request_body_size: 10,
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
          size: 10,
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
