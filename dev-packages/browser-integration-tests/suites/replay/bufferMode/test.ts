import { expect } from '@playwright/test';
import type { replayIntegration as actualReplayIntegration } from '@sentry-internal/replay';
import type { ReplayContainer } from '@sentry-internal/replay/build/npm/types/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../utils/helpers';
import { expectedClickBreadcrumb, getExpectedReplayEvent } from '../../../utils/replayEventTemplates';
import {
  getReplayEvent,
  getReplayRecordingContent,
  isReplayEvent,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

sentryTest(
  '[buffer-mode] manually start buffer mode and capture buffer',
  async ({ getLocalTestPath, page, browserName }) => {
    // This was sometimes flaky on webkit, so skipping for now
    if (shouldSkipReplayTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    let callsToSentry = 0;
    let errorEventId: string | undefined;
    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, 1);
    const reqErrorPromise = waitForErrorRequest(page);

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      const event = envelopeRequestParser(route.request());
      // error events have no type field
      if (event && !event.type && event.event_id) {
        errorEventId = event.event_id;
      }
      // We only want to count errors & replays here
      if (event && (!event.type || isReplayEvent(event))) {
        callsToSentry++;
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await page.locator('#go-background').click();
    await page.locator('#error').click();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // error, no replays
    await reqErrorPromise;
    expect(callsToSentry).toEqual(1);

    expect(
      await page.evaluate(() => {
        const replayIntegration = (window as unknown as Window & { Replay: ReturnType<typeof actualReplayIntegration> })
          .Replay;
        const replay = replayIntegration['_replay'];
        return replay.isEnabled();
      }),
    ).toBe(false);

    // Start buffering and assert that it is enabled
    expect(
      await page.evaluate(() => {
        const replayIntegration = (window as unknown as Window & { Replay: ReturnType<typeof actualReplayIntegration> })
          .Replay;
        const replay = replayIntegration['_replay'];
        replayIntegration.startBuffering();
        return replay.isEnabled();
      }),
    ).toBe(true);

    await page.locator('#log').click();
    await page.locator('#go-background').click();
    await page.locator('#error2').click();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2 errors
    await reqErrorPromise;
    expect(callsToSentry).toEqual(2);

    const [req0] = await Promise.all([
      reqPromise0,
      page.evaluate(async () => {
        const replayIntegration = (window as unknown as Window & { Replay: ReturnType<typeof actualReplayIntegration> })
          .Replay;
        await replayIntegration.flush();
      }),
    ]);

    // 2 errors, 1 flush
    await reqErrorPromise;
    expect(callsToSentry).toBeGreaterThanOrEqual(3);

    await page.locator('#log').click();
    await page.locator('#go-background').click();

    // Switches to session mode and then goes to background
    const req1 = await reqPromise1;
    expect(callsToSentry).toBeGreaterThanOrEqual(4);

    const event0 = getReplayEvent(req0);
    const content0 = getReplayRecordingContent(req0);

    const event1 = getReplayEvent(req1);
    const content1 = getReplayRecordingContent(req1);

    expect(event0).toEqual(
      getExpectedReplayEvent({
        error_ids: [errorEventId!],
        replay_type: 'buffer',
      }),
    );

    // The first event should have both, full and incremental snapshots,
    // as we recorded and kept all events in the buffer
    expect(content0.fullSnapshots).toHaveLength(1);
    // We don't know how many incremental snapshots we'll have (also browser-dependent),
    // but we know that we have at least 5
    expect(content0.incrementalSnapshots.length).toBeGreaterThan(5);
    // We want to make sure that the event that triggered the error was recorded.
    expect(content0.breadcrumbs).toEqual(
      expect.arrayContaining([
        {
          ...expectedClickBreadcrumb,
          message: 'body > button#error2',
          data: {
            nodeId: expect.any(Number),
            node: {
              attributes: {
                id: 'error2',
              },
              id: expect.any(Number),
              tagName: 'button',
              textContent: '******* *****',
            },
          },
        },
      ]),
    );

    expect(event1).toEqual(
      getExpectedReplayEvent({
        replay_type: 'buffer', // although we're in session mode, we still send 'buffer' as replay_type
        segment_id: 1,
        urls: [],
      }),
    );

    // From switching to session mode
    expect(content1.fullSnapshots).toHaveLength(1);
    expect(content1.breadcrumbs).toEqual(expect.arrayContaining([expectedClickBreadcrumb]));
  },
);

sentryTest(
  '[buffer-mode] manually start buffer mode and capture buffer, but do not continue as session',
  async ({ getLocalTestPath, page, browserName }) => {
    // This was sometimes flaky on webkit, so skipping for now
    if (shouldSkipReplayTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    let callsToSentry = 0;
    let errorEventId: string | undefined;
    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqErrorPromise = waitForErrorRequest(page);

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      const event = envelopeRequestParser(route.request());
      // error events have no type field
      if (event && !event.type && event.event_id) {
        errorEventId = event.event_id;
      }
      // We only want to count errors & replays here
      if (event && (!event.type || isReplayEvent(event))) {
        callsToSentry++;
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await page.locator('#go-background').click();
    await page.locator('#error').click();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // error, no replays
    await reqErrorPromise;
    expect(callsToSentry).toEqual(1);

    expect(
      await page.evaluate(() => {
        const replayIntegration = (window as unknown as Window & { Replay: { _replay: ReplayContainer } }).Replay;
        const replay = replayIntegration._replay;
        return replay.isEnabled();
      }),
    ).toBe(false);

    // Start buffering and assert that it is enabled
    expect(
      await page.evaluate(() => {
        const replayIntegration = (window as unknown as Window & { Replay: ReturnType<typeof actualReplayIntegration> })
          .Replay;
        const replay = replayIntegration['_replay'];
        replayIntegration.startBuffering();
        return replay.isEnabled();
      }),
    ).toBe(true);

    await page.locator('#log').click();
    await page.locator('#go-background').click();
    await page.locator('#error2').click();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2 errors
    await reqErrorPromise;
    expect(callsToSentry).toEqual(2);

    const [req0] = await Promise.all([
      reqPromise0,
      page.evaluate(async () => {
        const replayIntegration = (window as unknown as Window & { Replay: ReturnType<typeof actualReplayIntegration> })
          .Replay;
        await replayIntegration.flush({ continueRecording: false });
      }),
    ]);

    // 2 errors, 1 flush
    await reqErrorPromise;
    expect(callsToSentry).toEqual(3);

    await page.locator('#log').click();
    await page.locator('#go-background').click();

    // Has stopped recording, should make no more calls to Sentry
    expect(callsToSentry).toEqual(3);

    const event0 = getReplayEvent(req0);
    const content0 = getReplayRecordingContent(req0);

    expect(event0).toEqual(
      getExpectedReplayEvent({
        error_ids: [errorEventId!],
        replay_type: 'buffer',
      }),
    );

    // The first event should have both, full and incremental snapshots,
    // as we recorded and kept all events in the buffer
    expect(content0.fullSnapshots).toHaveLength(1);
    // We don't know how many incremental snapshots we'll have (also browser-dependent),
    // but we know that we have at least 5
    expect(content0.incrementalSnapshots.length).toBeGreaterThan(5);
    // We want to make sure that the event that triggered the error was recorded.
    expect(content0.breadcrumbs).toEqual(
      expect.arrayContaining([
        {
          ...expectedClickBreadcrumb,
          message: 'body > button#error2',
          data: {
            nodeId: expect.any(Number),
            node: {
              attributes: {
                id: 'error2',
              },
              id: expect.any(Number),
              tagName: 'button',
              textContent: '******* *****',
            },
          },
        },
      ]),
    );
  },
);

// Doing this in buffer mode to test changing error sample rate after first
// error happens.
sentryTest(
  '[buffer-mode] can sample on each error event',
  async ({ getLocalTestPath, page, browserName, enableConsole }) => {
    if (shouldSkipReplayTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    enableConsole();

    let callsToSentry = 0;
    const errorEventIds: string[] = [];
    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqErrorPromise0 = waitForErrorRequest(page);

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      const event = envelopeRequestParser(route.request());
      // error events have no type field
      if (event && !event.type && event.event_id) {
        errorEventIds.push(event.event_id);
      }
      // We only want to count errors & replays here
      if (event && (!event.type || isReplayEvent(event))) {
        callsToSentry++;
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    // Start buffering and assert that it is enabled
    expect(
      await page.evaluate(() => {
        const replayIntegration = (window as unknown as Window & { Replay: ReturnType<typeof actualReplayIntegration> })
          .Replay;
        const replay = replayIntegration['_replay'];
        replayIntegration.startBuffering();
        return replay.isEnabled();
      }),
    ).toBe(true);

    await page.locator('#go-background').click();
    await page.locator('#error').click();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 1 unsampled error, no replay
    const reqError0 = await reqErrorPromise0;
    const errorEvent0 = envelopeRequestParser(reqError0);
    expect(callsToSentry).toEqual(1);
    expect(errorEvent0.tags?.replayId).toBeUndefined();

    await page.evaluate(async () => {
      const replayIntegration = (window as unknown as Window & { Replay: ReturnType<typeof actualReplayIntegration> })
        .Replay;
      replayIntegration['_replay'].getOptions().errorSampleRate = 1.0;
    });

    // Error sample rate is now at 1.0, this error should create a replay
    const reqErrorPromise1 = waitForErrorRequest(page);
    const [req0] = await Promise.all([
      // 1 unsampled error, 1 sampled error -> 1 flush
      reqPromise0,
      page.locator('#error2').click(),
    ]);

    const reqError1 = await reqErrorPromise1;
    const errorEvent1 = envelopeRequestParser(reqError1);
    expect(callsToSentry).toEqual(3);
    expect(errorEvent0.event_id).not.toEqual(errorEvent1.event_id);
    expect(errorEvent1.tags?.replayId).toBeDefined();

    const event0 = getReplayEvent(req0);
    const content0 = getReplayRecordingContent(req0);

    expect(event0).toEqual(
      getExpectedReplayEvent({
        error_ids: errorEventIds,
        replay_type: 'buffer',
      }),
    );

    // The first event should have both, full and incremental snapshots,
    // as we recorded and kept all events in the buffer
    expect(content0.fullSnapshots).toHaveLength(1);
    // We want to make sure that the event that triggered the error was
    // recorded, as well as the first error that did not get sampled.
    expect(content0.breadcrumbs).toEqual(
      expect.arrayContaining([
        {
          ...expectedClickBreadcrumb,
          message: 'body > button#error',
          data: {
            nodeId: expect.any(Number),
            node: {
              attributes: {
                id: 'error',
              },
              id: expect.any(Number),
              tagName: 'button',
              textContent: '***** *****',
            },
          },
        },
        {
          ...expectedClickBreadcrumb,
          message: 'body > button#error2',
          data: {
            nodeId: expect.any(Number),
            node: {
              attributes: {
                id: 'error2',
              },
              id: expect.any(Number),
              tagName: 'button',
              textContent: '******* *****',
            },
          },
        },
      ]),
    );
  },
);
