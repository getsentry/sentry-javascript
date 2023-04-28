import 'jsdom-worker';

import pako from 'pako';

import { BASE_TIMESTAMP } from '../..';
import { EventBufferProxy } from '../../../src/eventBuffer/EventBufferProxy';
import { createEventBuffer } from './../../../src/eventBuffer';

const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };

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
    const restored = pako.inflate(result as Uint8Array, { to: 'string' });

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
    buffer.clear('session');
    await buffer.addEvent({ ...TEST_EVENT, type: 2 });

    const result = await buffer.finish();
    expect(result).toBeInstanceOf(Uint8Array);
    const restored = pako.inflate(result as Uint8Array, { to: 'string' });

    expect(restored).toEqual(JSON.stringify([{ ...TEST_EVENT, type: 2 }]));
  });

  it('clear works for buffer-based session', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
    }) as EventBufferProxy;

    expect(buffer).toBeInstanceOf(EventBufferProxy);

    // Ensure worker is ready
    await buffer.ensureWorkerIsLoaded();

    await buffer.addEvent({ ...TEST_EVENT, timestamp: BASE_TIMESTAMP });
    await buffer.addEvent({ ...TEST_EVENT, timestamp: BASE_TIMESTAMP + 100 });

    expect(buffer.getEarliestTimestamp()).toEqual(BASE_TIMESTAMP);

    buffer.clear('buffer');

    expect(buffer.getEarliestTimestamp()).toEqual(BASE_TIMESTAMP);

    await buffer.addEvent({ ...TEST_EVENT, timestamp: BASE_TIMESTAMP + 300 });
    await buffer.addEvent({ ...TEST_EVENT, timestamp: BASE_TIMESTAMP + 200 });

    expect(buffer.getEarliestTimestamp()).toEqual(BASE_TIMESTAMP);

    buffer.clear('buffer');

    expect(buffer.getEarliestTimestamp()).toEqual(BASE_TIMESTAMP + 200);

    await buffer.addEvent({ ...TEST_EVENT, timestamp: BASE_TIMESTAMP + 400 });

    expect(buffer.getEarliestTimestamp()).toEqual(BASE_TIMESTAMP + 200);

    const result = await buffer.finish();
    expect(result).toBeInstanceOf(Uint8Array);
    const restored = pako.inflate(result as Uint8Array, { to: 'string' });

    expect(restored).toEqual(
      JSON.stringify([
        { ...TEST_EVENT, timestamp: BASE_TIMESTAMP + 300 },
        { ...TEST_EVENT, timestamp: BASE_TIMESTAMP + 200 },
        { ...TEST_EVENT, timestamp: BASE_TIMESTAMP + 400 },
      ]),
    );

    expect(buffer.getEarliestTimestamp()).toEqual(null);
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
    const restored1 = pako.inflate(result1, { to: 'string' });
    const restored2 = pako.inflate(result2, { to: 'string' });

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

    const restored1 = pako.inflate(result1, { to: 'string' });
    const restored2 = pako.inflate(result2, { to: 'string' });

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

    // @ts-ignore Mock this private so it triggers an error
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

    // @ts-ignore Mock this private so it triggers an error
    jest.spyOn(buffer._compression._worker, 'postMessage').mockImplementationOnce(() => {
      return Promise.reject('test worker error');
    });

    await expect(() => buffer.addEvent({ data: { o: 3 }, timestamp: BASE_TIMESTAMP, type: 3 })).rejects.toBeDefined();
  });
});
