import { expect } from '@playwright/test';
import type * as Sentry from '@sentry/browser';
import type { EventEnvelopeHeaders } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../utils/helpers';
import { getReplaySnapshot, shouldSkipReplayTest, waitForReplayRunning } from '../../../utils/replayHelpers';

type TestWindow = Window & {
  Sentry: typeof Sentry;
  Replay: ReturnType<typeof Sentry.replayIntegration>;
};

sentryTest(
  'should add replay_id to dsc of transactions when in session mode',
  async ({ getLocalTestPath, page, browserName }) => {
    // This is flaky on webkit, so skipping there...
    if (shouldSkipReplayTest() || shouldSkipTracingTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });
    await page.goto(url);

    const transactionReq = waitForTransactionRequest(page);

    // Wait for this to be available
    await page.waitForFunction('!!window.Replay');

    await page.evaluate(() => {
      (window as unknown as TestWindow).Replay.start();
    });

    await waitForReplayRunning(page);

    await page.evaluate(() => {
      const scope = (window as unknown as TestWindow).Sentry.getCurrentScope();
      scope.setUser({ id: 'user123' });
      scope.addEventProcessor(event => {
        event.transaction = 'testTransactionDSC';
        return event;
      });
    });

    const req0 = await transactionReq;

    const envHeader = envelopeRequestParser(req0, 0) as EventEnvelopeHeaders;
    const replay = await getReplaySnapshot(page);

    expect(replay.session?.id).toBeDefined();

    expect(envHeader.trace).toBeDefined();
    expect(envHeader.trace).toEqual({
      environment: 'production',
      sample_rate: '1',
      trace_id: expect.any(String),
      public_key: 'public',
      replay_id: replay.session?.id,
      sampled: 'true',
    });
  },
);

sentryTest(
  'should not add replay_id to dsc of transactions when in buffer mode',
  async ({ getLocalTestPath, page, browserName }) => {
    // This is flaky on webkit, so skipping there...
    if (shouldSkipReplayTest() || shouldSkipTracingTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });
    await page.goto(url);

    const transactionReq = waitForTransactionRequest(page);

    await page.evaluate(() => {
      (window as unknown as TestWindow).Replay.startBuffering();
    });

    await waitForReplayRunning(page);

    await page.evaluate(() => {
      const scope = (window as unknown as TestWindow).Sentry.getCurrentScope();
      scope.setUser({ id: 'user123' });
      scope.addEventProcessor(event => {
        event.transaction = 'testTransactionDSC';
        return event;
      });
    });

    const req0 = await transactionReq;

    const envHeader = envelopeRequestParser(req0, 0) as EventEnvelopeHeaders;
    const replay = await getReplaySnapshot(page);

    expect(replay.session?.id).toBeDefined();

    expect(envHeader.trace).toBeDefined();
    expect(envHeader.trace).toEqual({
      environment: 'production',
      sample_rate: '1',
      trace_id: expect.any(String),
      public_key: 'public',
      sampled: 'true',
    });
  },
);

sentryTest(
  'should add replay_id to dsc of transactions when switching from buffer to session mode',
  async ({ getLocalTestPath, page, browserName }) => {
    // This is flaky on webkit, so skipping there...
    if (shouldSkipReplayTest() || shouldSkipTracingTest() || browserName === 'webkit') {
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
    await page.goto(url);

    const transactionReq = waitForTransactionRequest(page);

    await page.evaluate(() => {
      (window as unknown as TestWindow).Replay.startBuffering();
    });

    await waitForReplayRunning(page);

    await page.evaluate(async () => {
      // Manually trigger error handling
      await (window as unknown as TestWindow).Replay.flush();
    });

    await page.evaluate(() => {
      const scope = (window as unknown as TestWindow).Sentry.getCurrentScope();
      scope.setUser({ id: 'user123' });
      scope.addEventProcessor(event => {
        event.transaction = 'testTransactionDSC';
        return event;
      });
    });

    const req0 = await transactionReq;

    const envHeader = envelopeRequestParser(req0, 0) as EventEnvelopeHeaders;
    const replay = await getReplaySnapshot(page);

    expect(replay.session?.id).toBeDefined();
    expect(replay.recordingMode).toBe('session');

    expect(envHeader.trace).toBeDefined();
    expect(envHeader.trace).toEqual({
      environment: 'production',
      sample_rate: '1',
      trace_id: expect.any(String),
      public_key: 'public',
      replay_id: replay.session?.id,
      sampled: 'true',
    });
  },
);

sentryTest(
  'should not add replay_id to dsc of transactions if replay is not enabled',
  async ({ getLocalTestPath, page, browserName }) => {
    // This is flaky on webkit, so skipping there...
    if (shouldSkipReplayTest() || shouldSkipTracingTest() || browserName === 'webkit') {
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
    await page.goto(url);

    const transactionReq = waitForTransactionRequest(page);

    await page.evaluate(async () => {
      const scope = (window as unknown as TestWindow).Sentry.getCurrentScope();
      scope.setUser({ id: 'user123' });
      scope.addEventProcessor(event => {
        event.transaction = 'testTransactionDSC';
        return event;
      });
    });

    const req0 = await transactionReq;

    const envHeader = envelopeRequestParser(req0, 0) as EventEnvelopeHeaders;

    const replay = await getReplaySnapshot(page);

    expect(replay.session).toBeUndefined();

    expect(envHeader.trace).toBeDefined();
    expect(envHeader.trace).toEqual({
      environment: 'production',
      sample_rate: '1',
      trace_id: expect.any(String),
      public_key: 'public',
      sampled: 'true',
    });
  },
);
