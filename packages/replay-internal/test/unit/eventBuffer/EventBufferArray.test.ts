import { REPLAY_MAX_EVENT_BUFFER_SIZE } from '../../../src/constants';
import { createEventBuffer } from '../../../src/eventBuffer';
import { EventBufferSizeExceededError } from '../../../src/eventBuffer/error';
import { BASE_TIMESTAMP } from '../../index';
import { getTestEventIncremental } from '../../utils/getTestEvent';

const TEST_EVENT = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });

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
    buffer.clear();
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

  describe('size limit', () => {
    it('rejects if size exceeds limit', async function () {
      const buffer = createEventBuffer({ useCompression: false });

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
      const buffer = createEventBuffer({ useCompression: false });

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
      const buffer = createEventBuffer({ useCompression: false });

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
