import 'jsdom-worker';

import { inflate } from 'pako';

import { BASE_TIMESTAMP } from '../..';
import type { EventBufferArray } from '../../../src/eventBuffer/EventBufferArray';
import type { EventBufferCompressionWorker } from '../../../src/eventBuffer/EventBufferCompressionWorker';
import type { EventBufferPartitionedCompressionWorker } from '../../../src/eventBuffer/EventBufferPartitionedCompressionWorker';
import { EventBufferProxy } from '../../../src/eventBuffer/EventBufferProxy';
import { addEvent } from '../../../src/util/addEvent';
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

    // @ts-ignore Mock this private so it triggers an error
    jest.spyOn(replay.eventBuffer._compression._worker, 'postMessage').mockImplementationOnce(() => {
      return Promise.reject('test worker error');
    });

    await addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 10, type: 2 });

    expect(replay.isEnabled()).toEqual(false);
  });

  it.each([
    ['with compression ', true],
    ['without compression', false],
  ])('clears queue after two checkouts in error mode %s', async (_, useCompression) => {
    jest.setSystemTime(BASE_TIMESTAMP);

    const replay = setupReplayContainer({
      options: { useCompression, sessionSampleRate: 0, errorSampleRate: 1 },
    });

    const _eventBuffer = replay.eventBuffer as EventBufferArray | EventBufferProxy;
    let eventBuffer: EventBufferProxy | EventBufferArray = _eventBuffer;

    if (eventBuffer instanceof EventBufferProxy) {
      await eventBuffer.ensureWorkerIsLoaded();

      // @ts-ignore access private
      eventBuffer = eventBuffer._compression as EventBufferPartitionedCompressionWorker;
    }

    addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 10, type: 2 }, false);
    addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 0, type: 3 });
    await addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 100, type: 2 }, true);

    expect(replay.getContext().earliestEvent).toEqual(BASE_TIMESTAMP);
    expect(eventBuffer.events).toEqual([
      { data: {}, timestamp: BASE_TIMESTAMP + 10, type: 2 },
      { data: {}, timestamp: BASE_TIMESTAMP, type: 3 },
      { data: {}, timestamp: BASE_TIMESTAMP + 100, type: 2 },
    ]);

    await addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 200, type: 2 }, true);

    expect(replay.getContext().earliestEvent).toEqual(BASE_TIMESTAMP + 100);
    expect(eventBuffer.events).toEqual([
      { data: {}, timestamp: BASE_TIMESTAMP + 100, type: 2 },
      { data: {}, timestamp: BASE_TIMESTAMP + 200, type: 2 },
    ]);

    addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 250, type: 3 }, false);
    await addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 300, type: 2 }, true);

    expect(replay.getContext().earliestEvent).toEqual(BASE_TIMESTAMP + 200);
    expect(eventBuffer.events).toEqual([
      { data: {}, timestamp: BASE_TIMESTAMP + 200, type: 2 },
      { data: {}, timestamp: BASE_TIMESTAMP + 250, type: 3 },
      { data: {}, timestamp: BASE_TIMESTAMP + 300, type: 2 },
    ]);

    const events = await _eventBuffer.finish();
    const eventsString = typeof events === 'string' ? events : inflate(events, { to: 'string' });

    expect(eventsString).toEqual(
      JSON.stringify([
        { data: {}, timestamp: BASE_TIMESTAMP + 200, type: 2 },
        { data: {}, timestamp: BASE_TIMESTAMP + 250, type: 3 },
        { data: {}, timestamp: BASE_TIMESTAMP + 300, type: 2 },
      ]),
    );
  });

  it.each([
    ['with compression ', true],
    ['without compression', false],
  ])('clears queue after each checkout in session mode %s', async (_, useCompression) => {
    jest.setSystemTime(BASE_TIMESTAMP);

    const replay = setupReplayContainer({
      options: { useCompression, sessionSampleRate: 1, errorSampleRate: 0 },
    });

    const _eventBuffer = replay.eventBuffer!;
    let eventBuffer = _eventBuffer;

    if (eventBuffer instanceof EventBufferProxy) {
      await eventBuffer.ensureWorkerIsLoaded();

      // @ts-ignore private api
      eventBuffer = eventBuffer._compression as EventBufferCompressionWorker;
    }

    addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 10, type: 2 }, false);
    addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 0, type: 3 });
    await addEvent(replay, { data: {}, timestamp: BASE_TIMESTAMP + 100, type: 2 }, true);

    expect(replay.getContext().earliestEvent).toEqual(BASE_TIMESTAMP);

    const events = await _eventBuffer.finish();
    const eventsString = typeof events === 'string' ? events : inflate(events, { to: 'string' });

    expect(eventsString).toEqual(JSON.stringify([{ data: {}, timestamp: BASE_TIMESTAMP + 100, type: 2 }]));
  });
});
