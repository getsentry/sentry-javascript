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

    // clear() is called by addEvent when isCheckout is true
    buffer.clear('session');
    buffer.addEvent(TEST_EVENT);
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
});
