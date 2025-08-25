import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';
import { sentryTest, TEST_HOST } from '../../../utils/fixtures';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('should capture replays (@sentry-internal/replay export)', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);

  const url = await getLocalTestUrl({ testDir: __dirname });

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
    urls: [`${TEST_HOST}/index.html`],
    replay_id: expect.stringMatching(/\w{32}/),
    replay_start_timestamp: expect.any(Number),
    segment_id: 0,
    replay_type: 'session',
    event_id: expect.stringMatching(/\w{32}/),
    environment: 'production',
    sdk: {
      integrations: expect.arrayContaining([
        'InboundFilters',
        'FunctionToString',
        'BrowserApiErrors',
        'Breadcrumbs',
        'GlobalHandlers',
        'LinkedErrors',
        'Dedupe',
        'HttpContext',
        'BrowserSession',
        'Replay',
      ]),
      version: SDK_VERSION,
      name: 'sentry.javascript.browser',
      settings: {
        infer_ip: 'never',
      },
    },
    request: {
      url: `${TEST_HOST}/index.html`,
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
      integrations: expect.arrayContaining([
        'InboundFilters',
        'FunctionToString',
        'BrowserApiErrors',
        'Breadcrumbs',
        'GlobalHandlers',
        'LinkedErrors',
        'Dedupe',
        'HttpContext',
        'BrowserSession',
        'Replay',
      ]),
      version: SDK_VERSION,
      name: 'sentry.javascript.browser',
      settings: {
        infer_ip: 'never',
      },
    },
    request: {
      url: `${TEST_HOST}/index.html`,
      headers: {
        'User-Agent': expect.stringContaining(''),
      },
    },
    platform: 'javascript',
  });
});
