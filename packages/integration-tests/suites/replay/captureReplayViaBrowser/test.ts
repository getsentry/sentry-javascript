import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';
import type { ReplayEvent } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser } from '../../../utils/helpers';
import { waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('should capture replays (@sentry/browser export)', async ({ getLocalTestPath, page }) => {
  // For this test, we skip all bundle tests, as we're only interested in Replay being correctly
  // exported from the `@sentry/browser` npm package.
  if (process.env.PW_BUNDLE && process.env.PW_BUNDLE.startsWith('bundle_')) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  const replayEvent0 = envelopeRequestParser(await reqPromise0) as ReplayEvent;

  await page.click('button');
  const replayEvent1 = envelopeRequestParser(await reqPromise1) as ReplayEvent;

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
    contexts: { replay: { session_sample_rate: 1, error_sample_rate: 0 } },
  });

  expect(replayEvent1).toBeDefined();
  expect(replayEvent1).toEqual({
    type: 'replay_event',
    timestamp: expect.any(Number),
    error_ids: [],
    trace_ids: [],
    urls: [],
    replay_id: expect.stringMatching(/\w{32}/),
    segment_id: 1,
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
    contexts: { replay: { session_sample_rate: 1, error_sample_rate: 0 } },
  });
});
