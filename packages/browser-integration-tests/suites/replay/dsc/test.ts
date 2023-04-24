import { expect } from '@playwright/test';
import type * as Sentry from '@sentry/browser';
import type { EventEnvelopeHeaders } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeHeaderRequestParser, getFirstSentryEnvelopeRequest } from '../../../utils/helpers';
import { getReplaySnapshot, waitForReplayRunning } from '../../../utils/replayHelpers';

type TestWindow = Window & { Sentry: typeof Sentry; Replay: Sentry.Replay };

sentryTest(
  'should add replay_id to dsc of transactions',
  async ({ getLocalTestPath, page, browserName, isReplayCapableBundle, isTracingCapableBundle }) => {
    // This is flaky on webkit, so skipping there...
    if (!isReplayCapableBundle() || !isTracingCapableBundle() || browserName === 'webkit') {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });
    await page.goto(url);

    await page.evaluate(() => {
      (window as unknown as TestWindow).Sentry.configureScope(scope => {
        scope.setUser({ id: 'user123', segment: 'segmentB' });
        scope.setTransactionName('testTransactionDSC');
      });
    });

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
  },
);

sentryTest(
  'should not add replay_id to dsc of transactions if replay is not enabled',
  async ({ getLocalTestPath, page, browserName, isTracingCapableBundle, isReplayCapableBundle }) => {
    // This is flaky on webkit, so skipping there...
    if (!isReplayCapableBundle() || !isTracingCapableBundle() || browserName === 'webkit') {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });
    await page.goto(url);

    await page.evaluate(() => {
      (window as unknown as TestWindow).Replay.stop();

      (window as unknown as TestWindow).Sentry.configureScope(scope => {
        scope.setUser({ id: 'user123', segment: 'segmentB' });
        scope.setTransactionName('testTransactionDSC');
      });
    });

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
    });
  },
);
