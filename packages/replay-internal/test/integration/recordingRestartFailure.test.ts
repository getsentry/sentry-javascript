/**
 * @vitest-environment jsdom
 *
 * Reproduction for the PERMANENT "all rrweb recording stops" symptom.
 *
 * Reported signature: a buffered segment (Meta + FullSnapshot + a mutation) is
 * sent, then ALL rrweb recording stops for the rest of the session while the
 * integration keeps working (breadcrumbs/network/console still flow).
 *
 * Root path: the buffer→session conversion (`sendBufferedReplayOrFlush`) flushes
 * the buffered segment, calls `stopRecording()` (tears down rrweb), then
 * `startRecording()` to restart. If that restart fails — rrweb's own `record()`
 * swallows internal errors and returns `undefined` (rrweb.cjs:7530), and
 * `startRecording()` swallows throws (replay.ts:468) — `_stopRecording` ends up
 * undefined and there is NO recovery: rrweb is dead while `_isEnabled` stays
 * true, so breadcrumbs keep flushing and it looks like "recording just stopped".
 */
import '../utils/mock-internal-setTimeout';
import { captureException } from '@sentry/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FLUSH_MIN_DELAY } from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import type { RecordMock } from '../index';
import { BASE_TIMESTAMP } from '../index';
import { resetSdkMock } from '../mocks/resetSdkMock';
import type { DomHandler } from '../types';
import { getTestEventIncremental } from '../utils/getTestEvent';

async function waitForFlush(): Promise<void> {
  vi.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
  await new Promise(process.nextTick);
}

describe('Integration | recording dies if buffer→session restart fails', () => {
  let replay: ReplayContainer;
  let mockRecord: RecordMock;
  let domHandler: DomHandler;

  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(async () => {
    ({ mockRecord, domHandler, replay } = await resetSdkMock({
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
    }));
  });

  afterEach(async () => {
    clearSession(replay);
    replay.stop();
  });

  it('recovers when the buffer→session restart fails (watchdog restarts the recorder)', async () => {
    // Buffer mode: an initial checkout was already emitted by the mock's record();
    // add one mutation. This is the "Meta + FullSnapshot + a mutation" the user sees.
    const TEST_EVENT = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });
    mockRecord._emitter(TEST_EVENT);

    expect(replay.recordingMode).toBe('buffer');
    expect(replay['_stopRecording']).toBeTypeOf('function');

    // Emulate rrweb failing to (re)start during the conversion. The real-world
    // equivalents: record() throws, or rrweb swallows an internal error and
    // returns undefined.
    mockRecord.mockImplementationOnce(() => {
      throw new Error('rrweb record() failed on restart');
    });

    // An error triggers the buffer→session conversion:
    // flushImmediate() -> stopRecording() -> startRecording() [fails here].
    captureException(new Error('testing'));
    await vi.advanceTimersToNextTimerAsync();
    await vi.advanceTimersToNextTimerAsync();

    // The buffered segment (checkout + options + mutation) was sent before death.
    expect(replay).toHaveLastSentReplay();

    // Conversion flipped to session mode and the integration is still enabled.
    expect(replay.recordingMode).toBe('session');
    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);

    // Activity drives a flush. Without recovery the recorder would stay dead
    // forever (all rrweb stopped, breadcrumbs continuing). The flush-time
    // watchdog detects the missing recorder and restarts it.
    await waitForFlush();
    domHandler({ name: 'click', event: new Event('click') });
    await waitForFlush();

    // Recovered: recording is running again and the failure budget is reset.
    expect(replay['_stopRecording']).toBeTypeOf('function');
    expect(replay['_recordingFailureCount']).toBe(0);
  });

  it('stops retrying after the restart keeps failing, to avoid a hot loop', async () => {
    const TEST_EVENT = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });
    mockRecord._emitter(TEST_EVENT);

    // Every (re)start fails from now on.
    mockRecord.mockImplementation(() => {
      throw new Error('rrweb record() keeps failing');
    });

    captureException(new Error('testing'));
    await vi.advanceTimersToNextTimerAsync();
    await vi.advanceTimersToNextTimerAsync();

    // Drive several flushes; the watchdog retries but only up to the bound.
    for (let i = 0; i < 6; i++) {
      domHandler({ name: 'click', event: new Event('click') });
      await waitForFlush();
    }

    // Recording stays dead (record keeps failing), but the failure count is capped
    // at the max — proving the watchdog gave up instead of restarting on every flush.
    expect(replay['_stopRecording']).toBeUndefined();
    expect(replay['_recordingFailureCount']).toBe(3);
  });
});
