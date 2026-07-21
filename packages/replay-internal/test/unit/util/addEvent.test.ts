/**
 * @vitest-environment jsdom
 */

import 'jsdom-worker';
import '../../utils/mock-internal-setTimeout';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_REPLAY_DURATION, REPLAY_MAX_EVENT_BUFFER_SIZE, SESSION_IDLE_PAUSE_DURATION } from '../../../src/constants';
import type { EventBufferProxy } from '../../../src/eventBuffer/EventBufferProxy';
import { addEvent, shouldAddEvent } from '../../../src/util/addEvent';
import { BASE_TIMESTAMP } from '../..';
import { getTestEventIncremental } from '../../utils/getTestEvent';
import { setupReplayContainer } from '../../utils/setupReplayContainer';
import { getDefaultClientOptions, init } from '../../utils/TestClient';
import { getCurrentScope } from '@sentry/core';

describe('Unit | util | addEvent', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('stops when encountering a compression error', async function () {
    vi.setSystemTime(BASE_TIMESTAMP);

    const client = init(
      getDefaultClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
      }),
    );

    const replay = setupReplayContainer({
      options: {
        useCompression: true,
      },
    });

    await vi.runAllTimersAsync();
    await (replay.eventBuffer as EventBufferProxy).ensureWorkerIsLoaded();

    const handleExceptionSpy = vi.spyOn(replay, 'handleException');
    const recordDroppedEventSpy = vi.spyOn(client, 'recordDroppedEvent');

    // @ts-expect-error Mock this private so it triggers an error
    vi.spyOn(replay.eventBuffer._compression._worker, 'postMessage').mockImplementationOnce(() => {
      return Promise.reject('test worker error');
    });

    await addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 10, type: 2 });

    expect(replay.isEnabled()).toEqual(false);
    expect(handleExceptionSpy).toHaveBeenCalledWith('test worker error');
    expect(recordDroppedEventSpy).toHaveBeenCalledWith('internal_sdk_error', 'replay');
  });

  it('does not surface an error when the buffer is torn down mid-add', async function () {
    vi.setSystemTime(BASE_TIMESTAMP);

    const client = init(
      getDefaultClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
      }),
    );

    const replay = setupReplayContainer({
      options: {
        useCompression: true,
      },
    });

    await vi.runAllTimersAsync();
    await (replay.eventBuffer as EventBufferProxy).ensureWorkerIsLoaded();

    const handleExceptionSpy = vi.spyOn(replay, 'handleException');
    const recordDroppedEventSpy = vi.spyOn(client, 'recordDroppedEvent');

    // Simulate the teardown race: while an `addEvent` is in-flight, a concurrent
    // `stop()` (e.g. session refresh) disables replay and destroys the worker,
    // rejecting the pending request with "Worker destroyed". This must be treated
    // as benign - no dropped-event outcome, no exception, no redundant stop.
    vi.spyOn(
      // @ts-expect-error Access private worker to simulate the teardown race
      replay.eventBuffer._compression._worker,
      'postMessage',
    ).mockImplementationOnce(async () => {
      await replay.stop({ reason: 'sessionExpired' });
      throw new Error('Worker destroyed');
    });

    await addEvent(replay, getTestEventIncremental({ timestamp: BASE_TIMESTAMP + 10 }));

    expect(replay.isEnabled()).toEqual(false);
    expect(handleExceptionSpy).toHaveBeenCalledWith(new Error('Worker destroyed'));
    expect(recordDroppedEventSpy).not.toHaveBeenCalled();
  });

  it('stops when exceeding buffer size limit', async function () {
    vi.setSystemTime(BASE_TIMESTAMP);

    const replay = setupReplayContainer({
      options: {
        useCompression: true,
      },
    });

    await vi.runAllTimersAsync();

    const largeEvent = getTestEventIncremental({
      data: { a: 'a'.repeat(REPLAY_MAX_EVENT_BUFFER_SIZE / 3) },
      timestamp: BASE_TIMESTAMP,
    });

    await (replay.eventBuffer as EventBufferProxy).ensureWorkerIsLoaded();

    await addEvent(replay, largeEvent);
    await addEvent(replay, largeEvent);

    expect(replay.isEnabled()).toEqual(true);

    await addEvent(replay, largeEvent);

    expect(replay.isEnabled()).toEqual(false);
  });

  describe('shouldAddEvent', () => {
    beforeEach(() => {
      vi.setSystemTime(BASE_TIMESTAMP);
    });

    it('returns true by default', () => {
      const replay = setupReplayContainer({});
      const event = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });

      expect(shouldAddEvent(replay, event)).toEqual(true);
    });

    it('returns false when paused', () => {
      const replay = setupReplayContainer({});
      const event = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });

      replay.pause();

      expect(shouldAddEvent(replay, event)).toEqual(false);
    });

    it('returns false when disabled', async () => {
      const replay = setupReplayContainer({});
      const event = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });

      await replay.stop();

      expect(shouldAddEvent(replay, event)).toEqual(false);
    });

    it('returns false if there is no eventBuffer', () => {
      const replay = setupReplayContainer({});
      const event = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });

      replay.eventBuffer = null;

      expect(shouldAddEvent(replay, event)).toEqual(false);
    });

    it('returns false when event is too old', () => {
      const replay = setupReplayContainer({});
      const event = getTestEventIncremental({ timestamp: BASE_TIMESTAMP - SESSION_IDLE_PAUSE_DURATION - 1 });

      expect(shouldAddEvent(replay, event)).toEqual(false);
    });

    it('returns false if event is too long after initial timestamp', () => {
      const replay = setupReplayContainer({});
      const event = getTestEventIncremental({ timestamp: BASE_TIMESTAMP + MAX_REPLAY_DURATION + 1 });

      expect(shouldAddEvent(replay, event)).toEqual(false);
    });

    it('returns true if event is withing max duration after after initial timestamp', () => {
      const replay = setupReplayContainer({});
      const event = getTestEventIncremental({ timestamp: BASE_TIMESTAMP + MAX_REPLAY_DURATION - 1 });

      expect(shouldAddEvent(replay, event)).toEqual(true);
    });
  });
});
