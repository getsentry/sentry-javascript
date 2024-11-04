import { expect } from '@playwright/test';
import type * as Sentry from '@sentry/browser';
import type { EventEnvelopeHeaders } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipTracingTest,
  waitForErrorRequest,
  waitForTransactionRequest,
} from '../../../utils/helpers';
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

sentryTest('should add replay_id to error DSC while replay is active', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const hasTracing = !shouldSkipTracingTest();

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  const error1Req = waitForErrorRequest(page, event => event.exception?.values?.[0].value === 'This is error #1');
  const error2Req = waitForErrorRequest(page, event => event.exception?.values?.[0].value === 'This is error #2');

  // We want to wait for the transaction to be done, to ensure we have a consistent test
  const transactionReq = hasTracing ? waitForTransactionRequest(page) : Promise.resolve();

  // Wait for this to be available
  await page.waitForFunction('!!window.Replay');

  // We have to start replay before we finish the transaction, otherwise the DSC will not be frozen with the Replay ID
  await page.evaluate('window.Replay.start();');
  await waitForReplayRunning(page);
  await transactionReq;

  await page.evaluate('window._triggerError(1)');

  const error1Header = envelopeRequestParser(await error1Req, 0) as EventEnvelopeHeaders;
  const replay = await getReplaySnapshot(page);

  expect(replay.session?.id).toBeDefined();

  expect(error1Header.trace).toBeDefined();
  expect(error1Header.trace).toEqual({
    environment: 'production',
    trace_id: expect.any(String),
    public_key: 'public',
    replay_id: replay.session?.id,
    ...(hasTracing
      ? {
          sample_rate: '1',
          sampled: 'true',
        }
      : {}),
  });

  // Now end replay and trigger another error, it should not have a replay_id in DSC anymore
  await page.evaluate('window.Replay.stop();');
  await page.waitForFunction('!window.Replay.getReplayId();');
  await page.evaluate('window._triggerError(2)');

  const error2Header = envelopeRequestParser(await error2Req, 0) as EventEnvelopeHeaders;

  expect(error2Header.trace).toBeDefined();
  expect(error2Header.trace).toEqual({
    environment: 'production',
    trace_id: expect.any(String),
    public_key: 'public',
    ...(hasTracing
      ? {
          sample_rate: '1',
          sampled: 'true',
        }
      : {}),
  });
});
