import 'jsdom-worker';

import pako from 'pako';

import { BASE_TIMESTAMP } from '../..';
import { createEventBuffer } from '../../../src/eventBuffer';
import { EventBufferPartitionedCompressionWorker } from '../../../src/eventBuffer/EventBufferPartitionedCompressionWorker';
import { EventBufferProxy } from '../../../src/eventBuffer/EventBufferProxy';

const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };

describe('Unit | eventBuffer | EventBufferPartitionedCompressionWorker', () => {
  it('adds events to event buffer with compression worker', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
      keepLastCheckout: true,
    }) as EventBufferProxy;

    expect(buffer).toBeInstanceOf(EventBufferProxy);
    expect(buffer['_compression']).toBeInstanceOf(EventBufferPartitionedCompressionWorker);

    // Ensure worker is ready
    await buffer.ensureWorkerIsLoaded();

    buffer.addEvent(TEST_EVENT);
    buffer.addEvent(TEST_EVENT);

    const result = await buffer.finish();
    expect(result).toBeInstanceOf(Uint8Array);
    const restored = pako.inflate(result as Uint8Array, { to: 'string' });

    expect(restored).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));
  });

  it('adds checkout events to event buffer with compression worker', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
      keepLastCheckout: true,
    }) as EventBufferProxy;

    expect(buffer).toBeInstanceOf(EventBufferProxy);
    expect(buffer['_compression']).toBeInstanceOf(EventBufferPartitionedCompressionWorker);

    // Ensure worker is ready
    await buffer.ensureWorkerIsLoaded();

    await buffer.addEvent(TEST_EVENT);
    await buffer.addEvent(TEST_EVENT);

    // This should clear previous buffer, but keep last checkout
    buffer.clear(true);
    await buffer.addEvent({ ...TEST_EVENT, type: 2 }, true);

    await buffer.addEvent(TEST_EVENT);
    await buffer.addEvent(TEST_EVENT);

    // This should clear previous buffer, but keep last checkout
    buffer.clear(true);
    await buffer.addEvent({ ...TEST_EVENT, type: 2 }, true);

    const result = await buffer.finish();
    expect(result).toBeInstanceOf(Uint8Array);
    const restored = pako.inflate(result as Uint8Array, { to: 'string' });

    expect(restored).toEqual(
      JSON.stringify([{ ...TEST_EVENT, type: 2 }, TEST_EVENT, TEST_EVENT, { ...TEST_EVENT, type: 2 }]),
    );
  });

  it('calling `finish()` multiple times does not result in duplicated events', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
      keepLastCheckout: true,
    }) as EventBufferProxy;

    expect(buffer).toBeInstanceOf(EventBufferProxy);
    expect(buffer['_compression']).toBeInstanceOf(EventBufferPartitionedCompressionWorker);

    // Ensure worker is ready
    await buffer.ensureWorkerIsLoaded();

    buffer.addEvent(TEST_EVENT);

    const promise1 = buffer.finish();
    const promise2 = buffer.finish();

    const result1 = (await promise1) as Uint8Array;
    const result2 = (await promise2) as Uint8Array;
    const restored1 = pako.inflate(result1, { to: 'string' });
    const restored2 = pako.inflate(result2, { to: 'string' });

    expect(restored1).toEqual(JSON.stringify([TEST_EVENT]));
    expect(restored2).toEqual(JSON.stringify([]));
  });

  it('calling `finish()` multiple times, with events in between, does not result in duplicated or dropped events', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
      keepLastCheckout: true,
    }) as EventBufferProxy;

    expect(buffer).toBeInstanceOf(EventBufferProxy);
    expect(buffer['_compression']).toBeInstanceOf(EventBufferPartitionedCompressionWorker);

    // Ensure worker is ready
    await buffer.ensureWorkerIsLoaded();

    buffer.addEvent(TEST_EVENT);

    const promise1 = buffer.finish();
    await new Promise(process.nextTick);

    buffer.addEvent({ ...TEST_EVENT, type: 5 });
    const promise2 = buffer.finish();

    const result1 = (await promise1) as Uint8Array;
    const result2 = (await promise2) as Uint8Array;

    const restored1 = pako.inflate(result1, { to: 'string' });
    const restored2 = pako.inflate(result2, { to: 'string' });

    expect(restored1).toEqual(JSON.stringify([TEST_EVENT]));
    expect(restored2).toEqual(JSON.stringify([{ ...TEST_EVENT, type: 5 }]));
  });

  it('handles an error when compressing the payload', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
      keepLastCheckout: true,
    }) as EventBufferProxy;

    expect(buffer).toBeInstanceOf(EventBufferProxy);
    expect(buffer['_compression']).toBeInstanceOf(EventBufferPartitionedCompressionWorker);

    // Ensure worker is ready
    await buffer.ensureWorkerIsLoaded();

    await buffer.addEvent(TEST_EVENT);
    await buffer.addEvent(TEST_EVENT);

    // @ts-ignore Mock this private so it triggers an error
    jest.spyOn(buffer._compression._worker, 'postMessage').mockImplementationOnce(() => {
      return Promise.reject('test worker error');
    });

    await expect(() => buffer.finish()).rejects.toBeDefined();
  });
});
