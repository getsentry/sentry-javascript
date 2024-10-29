import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';

import { sentryTest } from '../../../utils/fixtures';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('should capture replays (@sentry-internal/replay export)', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  const replayEvent0 = getReplayEvent(await reqPromise0);

  await page.click('button');
  const replayEvent1 = getReplayEvent(await reqPromise1);

  expect(replayEvent0).toBeDefined();
  expect(replayEvent0).toEqual({
    type: 'replay_event',
    timestamp: expect.any(Number),
    error_ids: [],
    trace_ids: [],
    urls: [expect.stringMatching(/\/dist\/([\w-]+)\/index\.html$/)],
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
        'BrowserApiErrors',
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
    request: {
      url: expect.stringMatching(/\/dist\/([\w-]+)\/index\.html$/),
      headers: {
        'User-Agent': expect.stringContaining(''),
      },
    },
    platform: 'javascript',
  });

  expect(replayEvent1).toBeDefined();
  expect(replayEvent1).toEqual({
    type: 'replay_event',
    timestamp: expect.any(Number),
    error_ids: [],
    trace_ids: [],
    urls: [],
    replay_id: expect.stringMatching(/\w{32}/),
    replay_start_timestamp: expect.any(Number),
    segment_id: 1,
    replay_type: 'session',
    event_id: expect.stringMatching(/\w{32}/),
    environment: 'production',
    sdk: {
      integrations: [
        'InboundFilters',
        'FunctionToString',
        'BrowserApiErrors',
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
    request: {
      url: expect.stringMatching(/\/dist\/([\w-]+)\/index\.html$/),
      headers: {
        'User-Agent': expect.stringContaining(''),
      },
    },
    platform: 'javascript',
  });
});
