import pako from 'pako';

import { createEventBuffer } from './../../../src/eventBuffer';
import { BASE_TIMESTAMP } from './../../index';

const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };

describe('Unit | eventBuffer | EventBufferArray', () => {
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

  it('allows to provide custom compression function', async function () {
    const compressor = jest.fn(function () {
      return 'compressed output';
    });
    const buffer = createEventBuffer({
      useCompression: compressor,
    });

    buffer.addEvent(TEST_EVENT);
    buffer.addEvent(TEST_EVENT);

    const result = await buffer.finish();

    expect(result).toEqual('compressed output');

    expect(compressor).toHaveBeenCalledTimes(1);
    expect(compressor).toHaveBeenCalledWith([TEST_EVENT, TEST_EVENT]);
  });

  it('allows to provide custom compression function that outputs Uint8Array', async function () {
    const compressor = jest.fn(function (events) {
      return pako.deflate(JSON.stringify(events));
    });
    const buffer = createEventBuffer({
      useCompression: compressor,
    });

    buffer.addEvent(TEST_EVENT);
    buffer.addEvent(TEST_EVENT);

    const result = await buffer.finish();
    expect(result).toBeInstanceOf(Uint8Array);
    const restored = pako.inflate(result as Uint8Array, { to: 'string' });

    expect(restored).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));

    expect(compressor).toHaveBeenCalledTimes(1);
    expect(compressor).toHaveBeenCalledWith([TEST_EVENT, TEST_EVENT]);
  });

  it('handles errors in compressor', async () => {
    const compressor = jest.fn(function () {
      throw new Error('compressor error');
    });
    const buffer = createEventBuffer({
      useCompression: compressor,
    });

    buffer.addEvent(TEST_EVENT);
    buffer.addEvent(TEST_EVENT);

    const result = await buffer.finish();

    expect(result).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));

    expect(compressor).toHaveBeenCalledTimes(1);
    expect(compressor).toHaveBeenCalledWith([TEST_EVENT, TEST_EVENT]);
  });
});
