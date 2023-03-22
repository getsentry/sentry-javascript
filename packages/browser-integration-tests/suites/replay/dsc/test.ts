import { expect } from '@playwright/test';
import type { EventEnvelopeHeaders } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeHeaderRequestParser, getFirstSentryEnvelopeRequest } from '../../../utils/helpers';
import { getReplaySnapshot } from '../../../utils/replayHelpers';

sentryTest('should add replay_id to dsc of transactions', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  const replay = await getReplaySnapshot(page);

  expect(replay.session?.id).toBeDefined();

  const envHeader = await getFirstSentryEnvelopeRequest<EventEnvelopeHeaders>(page, url, envelopeHeaderRequestParser);

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
