import 'jsdom-worker';

import { BASE_TIMESTAMP } from '../..';
import { REPLAY_MAX_EVENT_BUFFER_SIZE } from '../../../src/constants';
import { createEventBuffer } from '../../../src/eventBuffer';
import { EventBufferProxy } from '../../../src/eventBuffer/EventBufferProxy';
import { EventBufferSizeExceededError } from '../../../src/eventBuffer/error';
import { decompress } from '../../utils/compression';
import { getTestEventIncremental } from '../../utils/getTestEvent';

const TEST_EVENT = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });

describe('Unit | eventBuffer | EventBufferCompressionWorker', () => {
  it('adds events to event buffer with compression worker', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
    }) as EventBufferProxy;

    expect(buffer).toBeInstanceOf(EventBufferProxy);

    // Ensure worker is ready
    await buffer.ensureWorkerIsLoaded();

    buffer.addEvent(TEST_EVENT);
    buffer.addEvent(TEST_EVENT);

    const result = await buffer.finish();
    expect(result).toBeInstanceOf(Uint8Array);
    const restored = decompress(result as Uint8Array);

    expect(restored).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));
  });

  it('adds checkout events to event buffer with compression worker', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
    }) as EventBufferProxy;

    expect(buffer).toBeInstanceOf(EventBufferProxy);

    // Ensure worker is ready
    await buffer.ensureWorkerIsLoaded();

    await buffer.addEvent(TEST_EVENT);
    await buffer.addEvent(TEST_EVENT);

    // clear() is called by addEvent when isCheckout is true
    buffer.clear();
    await buffer.addEvent({ ...TEST_EVENT, type: 2 });

    const result = await buffer.finish();
    expect(result).toBeInstanceOf(Uint8Array);
    const restored = decompress(result as Uint8Array);

    expect(restored).toEqual(JSON.stringify([{ ...TEST_EVENT, type: 2 }]));
  });

  it('calling `finish()` multiple times does not result in duplicated events', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
    }) as EventBufferProxy;

    expect(buffer).toBeInstanceOf(EventBufferProxy);

    // Ensure worker is ready
    await buffer.ensureWorkerIsLoaded();

    buffer.addEvent(TEST_EVENT);

    const promise1 = buffer.finish();
    const promise2 = buffer.finish();

    const result1 = (await promise1) as Uint8Array;
    const result2 = (await promise2) as Uint8Array;
    const restored1 = decompress(result1);
    const restored2 = decompress(result2);

    expect(restored1).toEqual(JSON.stringify([TEST_EVENT]));
    expect(restored2).toEqual(JSON.stringify([]));
  });

  it('calling `finish()` multiple times, with events in between, does not result in duplicated or dropped events', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
    }) as EventBufferProxy;

    expect(buffer).toBeInstanceOf(EventBufferProxy);

    // Ensure worker is ready
    await buffer.ensureWorkerIsLoaded();

    buffer.addEvent(TEST_EVENT);

    const promise1 = buffer.finish();
    await new Promise(process.nextTick);

    buffer.addEvent({ ...TEST_EVENT, type: 5 });
    const promise2 = buffer.finish();

    const result1 = (await promise1) as Uint8Array;
    const result2 = (await promise2) as Uint8Array;
    const restored1 = decompress(result1);
    const restored2 = decompress(result2);

    expect(restored1).toEqual(JSON.stringify([TEST_EVENT]));
    expect(restored2).toEqual(JSON.stringify([{ ...TEST_EVENT, type: 5 }]));
  });

  it('handles an error when compressing the payload', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
    }) as EventBufferProxy;

    expect(buffer).toBeInstanceOf(EventBufferProxy);

    // Ensure worker is ready
    await buffer.ensureWorkerIsLoaded();

    await buffer.addEvent(TEST_EVENT);
    await buffer.addEvent(TEST_EVENT);

    // @ts-expect-error Mock this private so it triggers an error
    jest.spyOn(buffer._compression._worker, 'postMessage').mockImplementationOnce(() => {
      return Promise.reject('test worker error');
    });

    await expect(() => buffer.finish()).rejects.toBeDefined();
  });

  it('handles an error when adding an event', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
    }) as EventBufferProxy;

    expect(buffer).toBeInstanceOf(EventBufferProxy);

    // Ensure worker is ready
    await buffer.ensureWorkerIsLoaded();

    await buffer.addEvent({ data: { o: 1 }, timestamp: BASE_TIMESTAMP, type: 3 });
    await buffer.addEvent({ data: { o: 2 }, timestamp: BASE_TIMESTAMP, type: 3 });

    // @ts-expect-error Mock this private so it triggers an error
    jest.spyOn(buffer._compression._worker, 'postMessage').mockImplementationOnce(() => {
      return Promise.reject('test worker error');
    });

    await expect(() => buffer.addEvent({ data: { o: 3 }, timestamp: BASE_TIMESTAMP, type: 3 })).rejects.toBeDefined();
  });

  describe('size limit', () => {
    it('rejects if size exceeds limit', async function () {
      const buffer = createEventBuffer({
        useCompression: true,
      }) as EventBufferProxy;

      expect(buffer).toBeInstanceOf(EventBufferProxy);
      await buffer.ensureWorkerIsLoaded();

      const largeEvent = getTestEventIncremental({
        data: { a: 'a'.repeat(REPLAY_MAX_EVENT_BUFFER_SIZE / 3) },
        timestamp: BASE_TIMESTAMP,
      });

      await buffer.addEvent(largeEvent);
      await buffer.addEvent(largeEvent);

      // Now it should error
      await expect(() => buffer.addEvent(largeEvent)).rejects.toThrowError(EventBufferSizeExceededError);
    });

    it('resets size limit on clear', async function () {
      const buffer = createEventBuffer({
        useCompression: true,
      }) as EventBufferProxy;

      expect(buffer).toBeInstanceOf(EventBufferProxy);
      await buffer.ensureWorkerIsLoaded();

      const largeEvent = getTestEventIncremental({
        data: { a: 'a'.repeat(REPLAY_MAX_EVENT_BUFFER_SIZE / 3) },
        timestamp: BASE_TIMESTAMP,
      });

      await buffer.addEvent(largeEvent);
      await buffer.addEvent(largeEvent);

      await buffer.clear();

      await buffer.addEvent(largeEvent);
    });

    it('resets size limit on finish', async function () {
      const buffer = createEventBuffer({
        useCompression: true,
      }) as EventBufferProxy;

      expect(buffer).toBeInstanceOf(EventBufferProxy);
      await buffer.ensureWorkerIsLoaded();

      const largeEvent = getTestEventIncremental({
        data: { a: 'a'.repeat(REPLAY_MAX_EVENT_BUFFER_SIZE / 3) },
        timestamp: BASE_TIMESTAMP,
      });

      await buffer.addEvent(largeEvent);
      await buffer.addEvent(largeEvent);

      await buffer.finish();

      await buffer.addEvent(largeEvent);
    });
  });
});
