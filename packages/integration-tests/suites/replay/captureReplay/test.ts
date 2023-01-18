import type { Page, Request } from '@playwright/test';
import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser } from '../../../utils/helpers';

sentryTest('captureReplay', async ({ getLocalTestPath, page }) => {
  // Replay bundles are es6 only
  if (process.env.PW_BUNDLE && process.env.PW_BUNDLE.startsWith('bundle_es5')) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);
  const reqPromise2 = waitForReplayRequest(page, 2);

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  const req0 = await reqPromise0;
  const replayEvent0 = envelopeRequestParser(req0);

  await page.click('button');
  await reqPromise1;

  await page.click('button');
  const req2 = await reqPromise2;

  const replayEvent2 = envelopeRequestParser(req2);

  expect(replayEvent0).toBeDefined();
  expect(replayEvent0).toEqual({
    type: 'replay_event',
    timestamp: expect.any(Number),
    error_ids: [],
    trace_ids: [],
    urls: [expect.stringContaining('/dist/index.html')],
    replay_id: expect.stringMatching(/\w{32}/),
    replay_start_timestamp: expect.any(Number),
    segment_id: 0,
    replay_type: 'session',
    event_id: expect.stringMatching(/\w{32}/),
    environment: 'production',
    sdk: {
      integrations: [
        'InboundFilters',
        'FunctionToString',
        'TryCatch',
        'Breadcrumbs',
        'GlobalHandlers',
        'LinkedErrors',
        'Dedupe',
        'HttpContext',
        'Replay',
      ],
      version: SDK_VERSION,
      name: 'sentry.javascript.browser',
    },
    sdkProcessingMetadata: {},
    request: {
      url: expect.stringContaining('/dist/index.html'),
      headers: {
        'User-Agent': expect.stringContaining(''),
      },
    },
    platform: 'javascript',
    tags: { sessionSampleRate: 1, errorSampleRate: 0 },
  });

  expect(replayEvent2).toBeDefined();
  expect(replayEvent2).toEqual({
    type: 'replay_event',
    timestamp: expect.any(Number),
    error_ids: [],
    trace_ids: [],
    urls: [],
    replay_id: expect.stringMatching(/\w{32}/),
    segment_id: 2,
    replay_type: 'session',
    event_id: expect.stringMatching(/\w{32}/),
    environment: 'production',
    sdk: {
      integrations: [
        'InboundFilters',
        'FunctionToString',
        'TryCatch',
        'Breadcrumbs',
        'GlobalHandlers',
        'LinkedErrors',
        'Dedupe',
        'HttpContext',
        'Replay',
      ],
      version: SDK_VERSION,
      name: 'sentry.javascript.browser',
    },
    sdkProcessingMetadata: {},
    request: {
      url: expect.stringContaining('/dist/index.html'),
      headers: {
        'User-Agent': expect.stringContaining(''),
      },
    },
    platform: 'javascript',
    tags: { sessionSampleRate: 1, errorSampleRate: 0 },
  });
});

function waitForReplayRequest(page: Page, segmentId?: number): Promise<Request> {
  return page.waitForRequest(
    req => {
      const postData = req.postData();
      if (!postData) {
        return false;
      }
      console.log(postData);

      const isReplayRequest = postData.includes('{"type":"replay_event"}');

      if (isReplayRequest && segmentId !== undefined) {
        return postData.includes(`{"segment_id":${segmentId}}`);
      }
      return isReplayRequest;
    },
    { timeout: 30_000 },
  );
}
