import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../utils/helpers';
import {
  getReplaySnapshot,
  isReplayEvent,
  shouldSkipReplayTest,
  waitForReplayRunning,
} from '../../../utils/replayHelpers';

sentryTest(
  'buffer mode remains after interrupting error event ingest',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipReplayTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    let errorCount = 0;
    let replayCount = 0;
    const errorEventIds: string[] = [];
    const replayIds: string[] = [];
    let firstReplayEventResolved: (value?: unknown) => void = () => {};
    // Need TS 5.7 for withResolvers
    const firstReplayEventPromise = new Promise(resolve => {
      firstReplayEventResolved = resolve;
    });

    const url = await getLocalTestUrl({ testDir: __dirname, skipDsnRouteHandler: true });

    await page.route(/^https:\/\/dsn\.ingest\.sentry\.io\//, async route => {
      const event = envelopeRequestParser(route.request());

      // Track error events
      if (event && !event.type && event.event_id) {
        errorCount++;
        errorEventIds.push(event.event_id);
        if (event.tags?.replayId) {
          replayIds.push(event.tags.replayId as string);

          if (errorCount === 1) {
            firstReplayEventResolved();
            // intentional so that it never resolves, we'll force a reload instead to interrupt the normal flow
            await new Promise(resolve => setTimeout(resolve, 100000));
          }
        }
      }

      // Track replay events and simulate failure for the first replay
      if (event && isReplayEvent(event)) {
        replayCount++;
      }

      // Success for other requests
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    await page.goto(url);

    // Wait for replay to initialize
    await waitForReplayRunning(page);

    waitForErrorRequest(page);
    await page.locator('#error1').click();

    // This resolves, but the route doesn't get fulfilled as we want the reload to "interrupt" this flow
    await firstReplayEventPromise;
    expect(errorCount).toBe(1);
    expect(replayCount).toBe(0);
    expect(replayIds).toHaveLength(1);

    const firstSession = await getReplaySnapshot(page);
    const firstSessionId = firstSession.session?.id;
    expect(firstSessionId).toBeDefined();
    expect(firstSession.session?.sampled).toBe('buffer');
    expect(firstSession.session?.dirty).toBe(true);
    expect(firstSession.recordingMode).toBe('buffer');

    await page.reload();
    const secondSession = await getReplaySnapshot(page);
    expect(secondSession.session?.sampled).toBe('buffer');
    expect(secondSession.session?.dirty).toBe(true);
    expect(secondSession.recordingMode).toBe('buffer');
    expect(secondSession.session?.id).toBe(firstSessionId);
    expect(secondSession.session?.segmentId).toBe(0);
  },
);

sentryTest('buffer mode remains after interrupting replay flush', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipReplayTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  let errorCount = 0;
  let replayCount = 0;
  const errorEventIds: string[] = [];
  const replayIds: string[] = [];
  let firstReplayEventResolved: (value?: unknown) => void = () => {};
  // Need TS 5.7 for withResolvers
  const firstReplayEventPromise = new Promise(resolve => {
    firstReplayEventResolved = resolve;
  });

  const url = await getLocalTestUrl({ testDir: __dirname, skipDsnRouteHandler: true });

  await page.route(/^https:\/\/dsn\.ingest\.sentry\.io\//, async route => {
    const event = envelopeRequestParser(route.request());

    // Track error events
    if (event && !event.type && event.event_id) {
      errorCount++;
      errorEventIds.push(event.event_id);
      if (event.tags?.replayId) {
        replayIds.push(event.tags.replayId as string);
      }
    }

    // Track replay events and simulate failure for the first replay
    if (event && isReplayEvent(event)) {
      replayCount++;
      if (replayCount === 1) {
        firstReplayEventResolved();
        // intentional so that it never resolves, we'll force a reload instead to interrupt the normal flow
        await new Promise(resolve => setTimeout(resolve, 100000));
      }
    }

    // Success for other requests
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  await page.goto(url);

  // Wait for replay to initialize
  await waitForReplayRunning(page);

  await page.locator('#error1').click();
  await firstReplayEventPromise;
  expect(errorCount).toBe(1);
  expect(replayCount).toBe(1);
  expect(replayIds).toHaveLength(1);

  // Get the first session info
  const firstSession = await getReplaySnapshot(page);
  const firstSessionId = firstSession.session?.id;
  expect(firstSessionId).toBeDefined();
  expect(firstSession.session?.sampled).toBe('buffer');
  expect(firstSession.session?.dirty).toBe(true);
  expect(firstSession.recordingMode).toBe('buffer'); // But still in buffer mode

  await page.reload();
  await waitForReplayRunning(page);
  const secondSession = await getReplaySnapshot(page);
  expect(secondSession.session?.sampled).toBe('buffer');
  expect(secondSession.session?.dirty).toBe(true);
  expect(secondSession.session?.id).toBe(firstSessionId);
  expect(secondSession.session?.segmentId).toBe(1);
  // Because a flush attempt was made and not allowed to complete, segmentId increased from 0,
  // so we resume in session mode
  expect(secondSession.recordingMode).toBe('session');
});

sentryTest(
  'starts a new session after interrupting replay flush and session "expires"',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipReplayTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    let errorCount = 0;
    let replayCount = 0;
    const errorEventIds: string[] = [];
    const replayIds: string[] = [];
    let firstReplayEventResolved: (value?: unknown) => void = () => {};
    // Need TS 5.7 for withResolvers
    const firstReplayEventPromise = new Promise(resolve => {
      firstReplayEventResolved = resolve;
    });

    const url = await getLocalTestUrl({ testDir: __dirname, skipDsnRouteHandler: true });

    await page.route(/^https:\/\/dsn\.ingest\.sentry\.io\//, async route => {
      const event = envelopeRequestParser(route.request());

      // Track error events
      if (event && !event.type && event.event_id) {
        errorCount++;
        errorEventIds.push(event.event_id);
        if (event.tags?.replayId) {
          replayIds.push(event.tags.replayId as string);
        }
      }

      // Track replay events and simulate failure for the first replay
      if (event && isReplayEvent(event)) {
        replayCount++;
        if (replayCount === 1) {
          firstReplayEventResolved();
          // intentional so that it never resolves, we'll force a reload instead to interrupt the normal flow
          await new Promise(resolve => setTimeout(resolve, 100000));
        }
      }

      // Success for other requests
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    await page.goto(url);

    // Wait for replay to initialize
    await waitForReplayRunning(page);

    // Trigger first error - this should change session sampled to "session"
    await page.locator('#error1').click();
    await firstReplayEventPromise;
    expect(errorCount).toBe(1);
    expect(replayCount).toBe(1);
    expect(replayIds).toHaveLength(1);

    // Get the first session info
    const firstSession = await getReplaySnapshot(page);
    const firstSessionId = firstSession.session?.id;
    expect(firstSessionId).toBeDefined();
    expect(firstSession.session?.sampled).toBe('buffer');
    expect(firstSession.session?.dirty).toBe(true);
    expect(firstSession.recordingMode).toBe('buffer'); // But still in buffer mode

    // Now expire the session by manipulating session storage
    // Simulate session expiry by setting lastActivity to a time in the past
    await page.evaluate(() => {
      const replayIntegration = (window as any).Replay;
      const replay = replayIntegration['_replay'];

      // Set session as expired (15 minutes ago)
      if (replay.session) {
        const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
        replay.session.lastActivity = fifteenMinutesAgo;
        replay.session.started = fifteenMinutesAgo;

        // Also update session storage if sticky sessions are enabled
        const sessionKey = 'sentryReplaySession';
        const sessionData = sessionStorage.getItem(sessionKey);
        if (sessionData) {
          const session = JSON.parse(sessionData);
          session.lastActivity = fifteenMinutesAgo;
          session.started = fifteenMinutesAgo;
          sessionStorage.setItem(sessionKey, JSON.stringify(session));
        }
      }
    });

    await page.reload();
    const secondSession = await getReplaySnapshot(page);
    expect(secondSession.session?.sampled).toBe('buffer');
    expect(secondSession.recordingMode).toBe('buffer');
    expect(secondSession.session?.id).not.toBe(firstSessionId);
    expect(secondSession.session?.segmentId).toBe(0);
  },
);
