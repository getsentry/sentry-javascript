import { expect } from '@playwright/test';
import type { EventEnvelopeHeaders } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import {
  envelopeHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  shouldSkipTracingTest,
} from '../../../utils/helpers';
import { getReplaySnapshot, shouldSkipReplayTest, waitForReplayRunning } from '../../../utils/replayHelpers';

sentryTest('should add replay_id to dsc of transactions', async ({ getLocalTestPath, page, browserName }) => {
  // This is flaky on webkit, so skipping there...
  if (shouldSkipReplayTest() || shouldSkipTracingTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  const envHeader = await getFirstSentryEnvelopeRequest<EventEnvelopeHeaders>(page, url, envelopeHeaderRequestParser);

  await waitForReplayRunning(page);
  const replay = await getReplaySnapshot(page);

  expect(replay.session?.id).toBeDefined();

  expect(envHeader.trace).toBeDefined();
  expect(envHeader.trace).toEqual({
    environment: 'production',
    user_segment: 'segmentB',
    sample_rate: '1',
    trace_id: expect.any(String),
    public_key: 'public',
    replay_id: replay.session?.id,
  });
});
