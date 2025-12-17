import type { PlaywrightTestArgs } from '@playwright/test';
import { expect } from '@playwright/test';
import type { TestFixtures } from '../../../utils/fixtures';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../utils/helpers';
import { collectReplayRequests, getReplayPerformanceSpans, shouldSkipReplayTest } from '../../../utils/replayHelpers';

/**
 * Shared helper to run the common test flow
 */
async function runRequestFetchTest(
  { page, getLocalTestUrl }: { page: PlaywrightTestArgs['page']; getLocalTestUrl: TestFixtures['getLocalTestUrl'] },
  options: {
    evaluateFn: () => void;
    expectedBody: any;
    expectedSize: number | any;
    expectedExtraReplayData?: any;
  },
) {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test.io/foo', route => route.fulfill({ status: 200 }));

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise = collectReplayRequests(page, recordingEvents =>
    getReplayPerformanceSpans(recordingEvents).some(span => span.op === 'resource.fetch'),
  );

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);
  await page.evaluate(options.evaluateFn);

  // Envelope/Breadcrumbs
  const eventData = envelopeRequestParser(await requestPromise);
  expect(eventData.exception?.values).toHaveLength(1);

  const fetchBreadcrumbs = eventData?.breadcrumbs?.filter(b => b.category === 'fetch');
  expect(fetchBreadcrumbs).toHaveLength(1);
  expect(fetchBreadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'fetch',
    type: 'http',
    data: {
      method: 'POST',
      request_body_size: options.expectedSize,
      status_code: 200,
      url: 'http://sentry-test.io/foo',
    },
  });

  // Replay Spans
  const { replayRecordingSnapshots } = await replayRequestPromise;
  const fetchSpans = getReplayPerformanceSpans(replayRecordingSnapshots).filter(s => s.op === 'resource.fetch');
  expect(fetchSpans).toHaveLength(1);

  expect(fetchSpans[0]).toMatchObject({
    data: {
      method: 'POST',
      statusCode: 200,
      request: {
        body: options.expectedBody,
      },
      ...options.expectedExtraReplayData,
    },
    description: 'http://sentry-test.io/foo',
    endTimestamp: expect.any(Number),
    op: 'resource.fetch',
    startTimestamp: expect.any(Number),
  });
}

sentryTest('captures request body when using Request object with text body', async ({ page, getLocalTestUrl }) => {
  await runRequestFetchTest(
    { page, getLocalTestUrl },
    {
      evaluateFn: () => {
        const request = new Request('http://sentry-test.io/foo', { method: 'POST', body: 'Request body text' });
        // @ts-expect-error Sentry is a global
        fetch(request).then(() => Sentry.captureException('test error'));
      },
      expectedBody: 'Request body text',
      expectedSize: 17,
    },
  );
});

sentryTest('captures request body when using Request object with JSON body', async ({ page, getLocalTestUrl }) => {
  await runRequestFetchTest(
    { page, getLocalTestUrl },
    {
      evaluateFn: () => {
        const request = new Request('http://sentry-test.io/foo', {
          method: 'POST',
          body: JSON.stringify({ name: 'John', age: 30 }),
        });
        // @ts-expect-error Sentry is a global
        fetch(request).then(() => Sentry.captureException('test error'));
      },
      expectedBody: { name: 'John', age: 30 },
      expectedSize: expect.any(Number),
    },
  );
});

sentryTest('prioritizes options body over Request object body', async ({ page, getLocalTestUrl, browserName }) => {
  const additionalHeaders = browserName === 'webkit' ? { 'content-type': 'text/plain' } : undefined;

  await runRequestFetchTest(
    { page, getLocalTestUrl },
    {
      evaluateFn: () => {
        const request = new Request('http://sentry-test.io/foo', { method: 'POST', body: 'original body' });
        // Second argument body should override the Request body
        // @ts-expect-error Sentry is a global
        fetch(request, { body: 'override body' }).then(() => Sentry.captureException('test error'));
      },
      expectedBody: 'override body',
      expectedSize: 13,
      expectedExtraReplayData: {
        request: { size: 13, headers: {} }, // Specific override structure check
        ...(additionalHeaders && { response: { headers: additionalHeaders } }),
      },
    },
  );
});

sentryTest('captures request body with FormData in Request object', async ({ page, getLocalTestUrl }) => {
  await runRequestFetchTest(
    { page, getLocalTestUrl },
    {
      evaluateFn: () => {
        const params = new URLSearchParams();
        params.append('key1', 'value1');
        params.append('key2', 'value2');
        const request = new Request('http://sentry-test.io/foo', { method: 'POST', body: params });
        // @ts-expect-error Sentry is a global
        fetch(request).then(() => Sentry.captureException('test error'));
      },
      expectedBody: 'key1=value1&key2=value2',
      expectedSize: 23,
    },
  );
});
