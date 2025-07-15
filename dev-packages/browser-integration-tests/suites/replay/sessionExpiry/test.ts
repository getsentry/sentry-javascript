import { expect } from '@playwright/test';
import type { replayIntegration as actualReplayIntegration } from '@sentry-internal/replay';
import { sentryTest } from '../../../utils/fixtures';
import { getExpectedReplayEvent } from '../../../utils/replayEventTemplates';
import {
  getFullRecordingSnapshots,
  getReplayEvent,
  getReplaySnapshot,
  normalize,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

// Session should expire after 2s - keep in sync with init.js
const SESSION_TIMEOUT = 2000;

sentryTest(
  'handles an expired session that re-samples to session',
  async ({ browserName, forceFlushReplay, getLocalTestUrl, page }) => {
    if (shouldSkipReplayTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, 1);

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);
    const req0 = await reqPromise0;

    const replayEvent0 = getReplayEvent(req0);
    expect(replayEvent0).toEqual(getExpectedReplayEvent({}));

    const fullSnapshots0 = getFullRecordingSnapshots(req0);
    expect(fullSnapshots0.length).toEqual(1);
    const stringifiedSnapshot = normalize(fullSnapshots0[0]);
    expect(stringifiedSnapshot).toMatchSnapshot('snapshot-0.json');

    // We wait for another segment 0
    const reqPromise2 = waitForReplayRequest(page, 0);

    await page.locator('#button1').click();
    await forceFlushReplay();
    const req1 = await reqPromise1;

    const replayEvent1 = getReplayEvent(req1);
    expect(replayEvent1).toEqual(getExpectedReplayEvent({ segment_id: 1, urls: [] }));

    const replay = await getReplaySnapshot(page);
    const oldSessionId = replay.session?.id;

    await new Promise(resolve => setTimeout(resolve, SESSION_TIMEOUT));

    await page.locator('#button2').click();
    await forceFlushReplay();
    const req2 = await reqPromise2;

    const replay2 = await getReplaySnapshot(page);

    expect(replay2.session?.id).not.toEqual(oldSessionId);

    const replayEvent2 = getReplayEvent(req2);
    expect(replayEvent2).toEqual(getExpectedReplayEvent({}));

    const fullSnapshots2 = getFullRecordingSnapshots(req2);
    expect(fullSnapshots2.length).toEqual(1);
    const stringifiedSnapshot2 = normalize(fullSnapshots2[0]);
    expect(stringifiedSnapshot2).toMatchSnapshot('snapshot-2.json');
  },
);

sentryTest(
  'handles an expired session that re-samples to buffer',
  async ({ browserName, forceFlushReplay, getLocalTestUrl, page }) => {
    if (shouldSkipReplayTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, 1);

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);
    const req0 = await reqPromise0;

    const replayEvent0 = getReplayEvent(req0);
    expect(replayEvent0).toEqual(getExpectedReplayEvent({}));

    const fullSnapshots0 = getFullRecordingSnapshots(req0);
    expect(fullSnapshots0.length).toEqual(1);
    const stringifiedSnapshot = normalize(fullSnapshots0[0]);
    expect(stringifiedSnapshot).toMatchSnapshot('snapshot-0.json');

    await page.locator('#button1').click();
    await forceFlushReplay();
    const req1 = await reqPromise1;

    const replayEvent1 = getReplayEvent(req1);
    expect(replayEvent1).toEqual(getExpectedReplayEvent({ segment_id: 1, urls: [] }));

    const replay = await getReplaySnapshot(page);
    const oldSessionId = replay.session?.id;

    await new Promise(resolve => setTimeout(resolve, SESSION_TIMEOUT));
    await page.evaluate(() => {
      const replayIntegration = (window as unknown as Window & { Replay: ReturnType<typeof actualReplayIntegration> })
        .Replay;
      replayIntegration['_replay'].getOptions().errorSampleRate = 1.0;
      replayIntegration['_replay'].getOptions().sessionSampleRate = 0.0;
    });

    let wasReplayFlushed = false;
    page.on('request', request => {
      if (request.url().includes('/api/1337/envelope/')) {
        wasReplayFlushed = true;
      }
    });
    await page.locator('#button2').click();
    await forceFlushReplay();

    // This timeout is not ideal, but not sure of a better way to ensure replay is not flushed
    await new Promise(resolve => setTimeout(resolve, SESSION_TIMEOUT));

    expect(wasReplayFlushed).toBe(false);

    const currentSessionId = await page.evaluate(() => {
      // @ts-expect-error - Replay is not typed
      return window.Replay._replay.session?.id;
    });

    expect(currentSessionId).not.toEqual(oldSessionId);
  },
);
