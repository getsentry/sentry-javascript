import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import {
  getCustomRecordingEvents,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../../../utils/replayHelpers';

sentryTest('captures text response body', async ({ getLocalTestPath, page, browserName }) => {
  // These are a bit flaky on non-chromium browsers
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('**/foo', route => {
    return route.fulfill({
      status: 200,
      body: 'response body',
      headers: {
        'Content-Length': '',
      },
    });
  });

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise1 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  void page.evaluate(() => {
    /* eslint-disable */
    const xhr = new XMLHttpRequest();

    xhr.open('POST', 'http://localhost:7654/foo');
    xhr.send();

    xhr.addEventListener('readystatechange', function () {
      if (xhr.readyState === 4) {
        // @ts-expect-error Sentry is a global
        setTimeout(() => Sentry.captureException('test error', 0));
      }
    });
    /* eslint-enable */
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
      response_body_size: 13,
      status_code: 200,
      url: 'http://localhost:7654/foo',
    },
  });

  const replayReq1 = await replayRequestPromise1;
  const { performanceSpans: performanceSpans1 } = getCustomRecordingEvents(replayReq1);
  expect(performanceSpans1.filter(span => span.op === 'resource.xhr')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        response: {
          size: 13,
          headers: {},
          body: 'response body',
        },
      },
      description: 'http://localhost:7654/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.xhr',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest('captures JSON response body', async ({ getLocalTestPath, page, browserName }) => {
  // These are a bit flaky on non-chromium browsers
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('**/foo', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({ res: 'this' }),
      headers: {
        'Content-Length': '',
      },
    });
  });

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise1 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  void page.evaluate(() => {
    /* eslint-disable */
    const xhr = new XMLHttpRequest();

    xhr.open('POST', 'http://localhost:7654/foo');
    xhr.send();

    xhr.addEventListener('readystatechange', function () {
      if (xhr.readyState === 4) {
        // @ts-expect-error Sentry is a global
        setTimeout(() => Sentry.captureException('test error', 0));
      }
    });
    /* eslint-enable */
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
      response_body_size: 14,
      status_code: 200,
      url: 'http://localhost:7654/foo',
    },
  });

  const replayReq1 = await replayRequestPromise1;
  const { performanceSpans: performanceSpans1 } = getCustomRecordingEvents(replayReq1);
  expect(performanceSpans1.filter(span => span.op === 'resource.xhr')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        response: {
          size: 14,
          headers: {},
          body: { res: 'this' },
        },
      },
      description: 'http://localhost:7654/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.xhr',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest('captures JSON response body when responseType=json', async ({ getLocalTestPath, page, browserName }) => {
  // These are a bit flaky on non-chromium browsers
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('**/foo', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({ res: 'this' }),
      headers: {
        'Content-Length': '',
      },
    });
  });

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise1 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  void page.evaluate(() => {
    /* eslint-disable */
    const xhr = new XMLHttpRequest();

    xhr.open('POST', 'http://localhost:7654/foo');
    // Setting this to json ensures that xhr.response returns a POJO
    xhr.responseType = 'json';
    xhr.send();

    xhr.addEventListener('readystatechange', function () {
      if (xhr.readyState === 4) {
        // @ts-expect-error Sentry is a global
        setTimeout(() => Sentry.captureException('test error', 0));
      }
    });
    /* eslint-enable */
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
      response_body_size: 14,
      status_code: 200,
      url: 'http://localhost:7654/foo',
    },
  });

  const replayReq1 = await replayRequestPromise1;
  const { performanceSpans: performanceSpans1 } = getCustomRecordingEvents(replayReq1);
  expect(performanceSpans1.filter(span => span.op === 'resource.xhr')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        response: {
          size: 14,
          headers: {},
          body: { res: 'this' },
        },
      },
      description: 'http://localhost:7654/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.xhr',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest('captures non-text response body', async ({ getLocalTestPath, page, browserName }) => {
  // These are a bit flaky on non-chromium browsers
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('**/foo', async route => {
    return route.fulfill({
      status: 200,
      body: Buffer.from('<html>Hello world</html>'),
      headers: {
        'Content-Length': '',
      },
    });
  });

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise1 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  await page.evaluate(() => {
    /* eslint-disable */
    const xhr = new XMLHttpRequest();

    xhr.open('POST', 'http://localhost:7654/foo');
    xhr.send();

    xhr.addEventListener('readystatechange', function () {
      if (xhr.readyState === 4) {
        // @ts-expect-error Sentry is a global
        setTimeout(() => Sentry.captureException('test error', 0));
      }
    });
    /* eslint-enable */
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
      url: 'http://localhost:7654/foo',
    },
  });

  const replayReq1 = await replayRequestPromise1;
  const { performanceSpans: performanceSpans1 } = getCustomRecordingEvents(replayReq1);
  expect(performanceSpans1.filter(span => span.op === 'resource.xhr')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        response: {
          size: 24,
          headers: {},
          body: '<html>Hello world</html>',
        },
      },
      description: 'http://localhost:7654/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.xhr',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest(
  'does not capture response body when URL does not match',
  async ({ getLocalTestPath, page, browserName }) => {
    // These are a bit flaky on non-chromium browsers
    if (shouldSkipReplayTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    await page.route('**/bar', route => {
      return route.fulfill({
        status: 200,
        body: 'response body',
        headers: {
          'Content-Length': '',
        },
      });
    });

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const requestPromise = waitForErrorRequest(page);
    const replayRequestPromise1 = waitForReplayRequest(page, 0);

    const url = await getLocalTestPath({ testDir: __dirname });
    await page.goto(url);

    void page.evaluate(() => {
      /* eslint-disable */
      const xhr = new XMLHttpRequest();

      xhr.open('POST', 'http://localhost:7654/bar');
      xhr.send();

      xhr.addEventListener('readystatechange', function () {
        if (xhr.readyState === 4) {
          // @ts-expect-error Sentry is a global
          setTimeout(() => Sentry.captureException('test error', 0));
        }
      });
      /* eslint-enable */
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
        response_body_size: 13,
        status_code: 200,
        url: 'http://localhost:7654/bar',
      },
    });

    const replayReq1 = await replayRequestPromise1;
    const { performanceSpans: performanceSpans1 } = getCustomRecordingEvents(replayReq1);
    expect(performanceSpans1.filter(span => span.op === 'resource.xhr')).toEqual([
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
        description: 'http://localhost:7654/bar',
        endTimestamp: expect.any(Number),
        op: 'resource.xhr',
        startTimestamp: expect.any(Number),
      },
    ]);
  },
);
