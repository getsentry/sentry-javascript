import 'jsdom-worker';

import { BASE_TIMESTAMP } from '../..';
import { REPLAY_MAX_EVENT_BUFFER_SIZE } from '../../../src/constants';
import type { EventBufferProxy } from '../../../src/eventBuffer/EventBufferProxy';
import { addEvent } from '../../../src/util/addEvent';
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
});
