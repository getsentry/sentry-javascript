import 'jsdom-worker';

import pako from 'pako';

import { createEventBuffer, EventBufferCompressionWorker } from './../../src/eventBuffer';
import { BASE_TIMESTAMP } from './../index';

const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
describe('Unit | eventBuffer', () => {
  it('adds events to normal event buffer', async function () {
    const buffer = createEventBuffer({ useCompression: false });

    buffer.addEvent(TEST_EVENT);
    buffer.addEvent(TEST_EVENT);

    const result = await buffer.finish();

    expect(result).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));
  });

  it('adds checkout event to normal event buffer', async function () {
    const buffer = createEventBuffer({ useCompression: false });

    buffer.addEvent(TEST_EVENT);
    buffer.addEvent(TEST_EVENT);
    buffer.addEvent(TEST_EVENT);

    buffer.addEvent(TEST_EVENT, true);
    const result = await buffer.finish();

    expect(result).toEqual(JSON.stringify([TEST_EVENT]));
  });

  it('calling `finish()` multiple times does not result in duplicated events', async function () {
    const buffer = createEventBuffer({ useCompression: false });

    buffer.addEvent(TEST_EVENT);

    const promise1 = buffer.finish();
    const promise2 = buffer.finish();

    const result1 = (await promise1) as Uint8Array;
    const result2 = (await promise2) as Uint8Array;

    expect(result1).toEqual(JSON.stringify([TEST_EVENT]));
    expect(result2).toEqual(JSON.stringify([]));
  });

  it('adds events to event buffer with compression worker', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
    }) as EventBufferCompressionWorker;

    buffer.addEvent(TEST_EVENT);
    buffer.addEvent(TEST_EVENT);

    const result = await buffer.finish();
    const restored = pako.inflate(result, { to: 'string' });

    expect(restored).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));
  });

  it('adds checkout events to event buffer with compression worker', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
    }) as EventBufferCompressionWorker;

    await buffer.addEvent(TEST_EVENT);
    await buffer.addEvent(TEST_EVENT);

    // This should clear previous buffer
    await buffer.addEvent({ ...TEST_EVENT, type: 2 }, true);

    const result = await buffer.finish();
    const restored = pako.inflate(result, { to: 'string' });

    expect(restored).toEqual(JSON.stringify([{ ...TEST_EVENT, type: 2 }]));
  });

  it('calling `finish()` multiple times does not result in duplicated events', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
    }) as EventBufferCompressionWorker;

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
    }) as EventBufferCompressionWorker;

    buffer.addEvent(TEST_EVENT);

    const promise1 = buffer.finish();

    buffer.addEvent({ ...TEST_EVENT, type: 5 });
    const promise2 = buffer.finish();

    const result1 = (await promise1) as Uint8Array;
    const result2 = (await promise2) as Uint8Array;

    const restored1 = pako.inflate(result1, { to: 'string' });
    const restored2 = pako.inflate(result2, { to: 'string' });

    expect(restored1).toEqual(JSON.stringify([TEST_EVENT]));
    expect(restored2).toEqual(JSON.stringify([{ ...TEST_EVENT, type: 5 }]));
  });
});
