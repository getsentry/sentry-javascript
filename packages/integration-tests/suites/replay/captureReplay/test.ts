import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest('captureReplay', async ({ getLocalTestPath, page }) => {
  // Replay bundles are es6 only
  if (process.env.PW_BUNDLE && process.env.PW_BUNDLE.startsWith('bundle_es5')) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  const reqPromise = page.waitForRequest(req => {
    const postData = req.postData();
    if (!postData) {
      return false;
    }
    return postData.includes('{"type":"replay_event"}');
  });

  await page.goto(url);
  await reqPromise;

  const reqPromise2 = page.waitForRequest(req => {
    const postData = req.postData();
    if (!postData) {
      return false;
    }
    return postData.includes('{"type":"replay_event"}');
  });

  await page.click('button');
  await reqPromise2;

  const replayEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(replayEvent).toBeDefined();
  expect(replayEvent).toEqual({
    type: 'replay_event',
    timestamp: expect.any(Number),
    error_ids: [],
    trace_ids: [],
    urls: [expect.stringContaining('/dist/index.html')],
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
