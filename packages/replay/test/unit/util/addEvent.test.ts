import 'jsdom-worker';

import { BASE_TIMESTAMP } from '../..';
import { MAX_REPLAY_DURATION, REPLAY_MAX_EVENT_BUFFER_SIZE, SESSION_IDLE_PAUSE_DURATION } from '../../../src/constants';
import type { EventBufferProxy } from '../../../src/eventBuffer/EventBufferProxy';
import { addEvent, shouldAddEvent } from '../../../src/util/addEvent';
import { getTestEventIncremental } from '../../utils/getTestEvent';
import { setupReplayContainer } from '../../utils/setupReplayContainer';
import { useFakeTimers } from '../../utils/use-fake-timers';

useFakeTimers();

describe('Unit | util | addEvent', () => {
  it('stops when encountering a compression error', async function () {
    jest.setSystemTime(BASE_TIMESTAMP);

    const replay = setupReplayContainer({
      options: {
        useCompression: true,
      },
    });

    await (replay.eventBuffer as EventBufferProxy).ensureWorkerIsLoaded();

    // @ts-expect-error Mock this private so it triggers an error
    jest.spyOn(replay.eventBuffer._compression._worker, 'postMessage').mockImplementationOnce(() => {
      return Promise.reject('test worker error');
    });

    await addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 10, type: 2 });

    expect(replay.isEnabled()).toEqual(false);
  });

  it('stops when exceeding buffer size limit', async function () {
    jest.setSystemTime(BASE_TIMESTAMP);

    const replay = setupReplayContainer({
      options: {
        useCompression: true,
      },
    });

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
      jest.setSystemTime(BASE_TIMESTAMP);
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
