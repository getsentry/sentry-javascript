import 'jsdom-worker';

import { BASE_TIMESTAMP } from '../..';
import type { EventBufferProxy } from '../../../src/eventBuffer/EventBufferProxy';
import { addEvent } from '../../../src/util/addEvent';
import { setupReplayContainer } from '../../utils/setupReplayContainer';
import { useFakeTimers } from '../../utils/use-fake-timers';
import { EventCounter } from '../../../src/util/EventCounter';
import { EVENT_ROLLING_WINDOW_TIME, EVENT_ROLLING_WINDOW_MAX } from '../../../src/constants';

useFakeTimers();

describe('Unit | util | addEvent', () => {
  beforeEach(function () {
    jest.setSystemTime(BASE_TIMESTAMP);
  });

  it('stops when encountering a compression error', async function () {
    const replay = setupReplayContainer({
      options: {
        useCompression: true,
      },
    });

    await (replay.eventBuffer as EventBufferProxy).ensureWorkerIsLoaded();

    // @ts-ignore Mock this private so it triggers an error
    jest.spyOn(replay.eventBuffer._compression._worker, 'postMessage').mockImplementationOnce(() => {
      return Promise.reject('test worker error');
    });

    await addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 10, type: 2 });

    expect(replay.isEnabled()).toEqual(false);
  });

  describe('event count rolling window', () => {
    it('pauses when triggering too many events', async function () {
      const replay = setupReplayContainer({});
      // This is overwritten by defaults for tests, we want to try it with the proper values
      replay.eventCounter = new EventCounter(EVENT_ROLLING_WINDOW_TIME, EVENT_ROLLING_WINDOW_MAX);

      // Now trigger A LOT of events
      for (let i = 0; i < EVENT_ROLLING_WINDOW_MAX - 10; i++) {
        addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP, type: 2 });
      }
      await new Promise(process.nextTick);

      // Nothing should have happend, all still live
      expect(replay.isPaused()).toEqual(false);

      // now add a few more with a short delay, should still be running
      for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(5);
        addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + i * 5, type: 2 });
      }
      await new Promise(process.nextTick);

      expect(replay.isPaused()).toEqual(false);

      // Now add one more, should trigger the pause
      addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 90, type: 2 });
      await new Promise(process.nextTick);

      expect(replay.isPaused()).toEqual(true);

      // Wait for the rolling window to pass, should trigger a resume
      jest.advanceTimersByTime(EVENT_ROLLING_WINDOW_TIME);
      await new Promise(process.nextTick);

      expect(replay.isPaused()).toEqual(false);
    });

    it('throws out event count after rolling window timeout', async function () {
      const replay = setupReplayContainer({});
      // This is overwritten by defaults for tests, we want to try it with the proper values
      replay.eventCounter = new EventCounter(EVENT_ROLLING_WINDOW_TIME, EVENT_ROLLING_WINDOW_MAX);

      // Now trigger A LOT of events
      for (let i = 0; i < EVENT_ROLLING_WINDOW_MAX * 2; i++) {
        jest.advanceTimersByTime(1);
        addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + i * 1, type: 2 });
      }
      await new Promise(process.nextTick);

      // Nothing should have happend, all still live,
      // because the events continuously move out of the window
      expect(replay.isPaused()).toEqual(false);
    });
  });
});
