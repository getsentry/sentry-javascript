import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import {
  collectReplayRequests,
  getReplayPerformanceSpans,
  shouldSkipReplayTest,
} from '../../../../../utils/replayHelpers';

// Skipping because this test is flaky
// https://github.com/getsentry/sentry-javascript/issues/10395
sentryTest.skip('captures request body size when body is sent', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('**/foo', route => {
    return route.fulfill({
      status: 200,
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
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.fetch');
  });

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  await page.evaluate(() => {
    /* eslint-disable */
    fetch('http://localhost:7654/foo', {
      method: 'POST',
      body: '{"foo":"bar"}',
    }).then(() => {
      // @ts-expect-error Sentry is a global
      Sentry.captureException('test error');
    });
    /* eslint-enable */
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
      url: 'http://localhost:7654/foo',
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
      description: 'http://localhost:7654/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.fetch',
      startTimestamp: expect.any(Number),
    },
  ]);
});

sentryTest('captures request size from non-text request body', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('**/foo', async route => {
    return route.fulfill({
      status: 200,
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
  const replayRequestPromise = collectReplayRequests(page, recordingEvents => {
    return getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.fetch');
  });

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  await page.evaluate(() => {
    /* eslint-disable */
    const blob = new Blob(['<html>Hello world!!</html>'], { type: 'text/html' });

    fetch('http://localhost:7654/foo', {
      method: 'POST',
      body: blob,
    }).then(() => {
      // @ts-expect-error Sentry is a global
      Sentry.captureException('test error');
    });
    /* eslint-enable */
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
      request_body_size: 26,
      status_code: 200,
      url: 'http://localhost:7654/foo',
    },
  });

  const { replayRecordingSnapshots } = await replayRequestPromise;
  expect(getReplayPerformanceSpans(replayRecordingSnapshots).filter(span => span.op === 'resource.fetch')).toEqual([
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
      description: 'http://localhost:7654/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.fetch',
      startTimestamp: expect.any(Number),
    },
  ]);
});
