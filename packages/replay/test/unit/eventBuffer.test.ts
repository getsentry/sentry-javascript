import 'jsdom-worker';

import pako from 'pako';

import { createEventBuffer } from './../../src/eventBuffer';
import { BASE_TIMESTAMP } from './../index';
import { EventBufferProxy } from '../../src/eventBuffer/EventBufferProxy';

const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
describe('Unit | eventBuffer', () => {
  describe('EventBufferArray', () => {
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
  });

  describe('EventBufferCompressionWorker', () => {
    it('adds events to event buffer with compression worker', async function () {
      const buffer = createEventBuffer({
        useCompression: true,
      }) as EventBufferProxy;

      expect(buffer).toBeInstanceOf(EventBufferProxy);

      // Ensure worker is ready
      await buffer['_ensureWorkerIsLoaded']();

      buffer.addEvent(TEST_EVENT);
      buffer.addEvent(TEST_EVENT);

      expect(buffer.pendingEvents).toEqual([TEST_EVENT, TEST_EVENT]);

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
      await buffer['_ensureWorkerIsLoaded']();

      await buffer.addEvent(TEST_EVENT);
      await buffer.addEvent(TEST_EVENT);

      // This should clear previous buffer
      await buffer.addEvent({ ...TEST_EVENT, type: 2 }, true);

      const result = await buffer.finish();
      expect(result).toBeInstanceOf(Uint8Array);
      const restored = pako.inflate(result as Uint8Array, { to: 'string' });

      expect(restored).toEqual(JSON.stringify([{ ...TEST_EVENT, type: 2 }]));
    });

    it('calling `finish()` multiple times does not result in duplicated events', async function () {
      const buffer = createEventBuffer({
        useCompression: true,
      }) as EventBufferProxy;

      expect(buffer).toBeInstanceOf(EventBufferProxy);

      // Ensure worker is ready
      await buffer['_ensureWorkerIsLoaded']();

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
      await buffer['_ensureWorkerIsLoaded']();

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

  describe('EventBufferProxy fallback', () => {
    let consoleErrorSpy: jest.SpyInstance<any>;

    beforeEach(() => {
      // Avoid logging errors to console
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('first uses simple buffer, and switches over once worker is loaded', async function () {
      const buffer = createEventBuffer({
        useCompression: true,
      }) as EventBufferProxy;

      expect(buffer).toBeInstanceOf(EventBufferProxy);

      buffer.addEvent(TEST_EVENT);
      buffer.addEvent(TEST_EVENT);

      expect(buffer.pendingEvents).toEqual([TEST_EVENT, TEST_EVENT]);

      // Finish before the worker is loaded
      const result = await buffer.finish();
      expect(typeof result).toBe('string');
      expect(result).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));

      // Now actually finish loading the worker
      await buffer['_ensureWorkerIsLoaded']();

      buffer.addEvent(TEST_EVENT);
      buffer.addEvent(TEST_EVENT);
      buffer.addEvent(TEST_EVENT);

      expect(buffer.pendingEvents).toEqual([TEST_EVENT, TEST_EVENT, TEST_EVENT]);

      const result2 = await buffer.finish();
      expect(result2).toBeInstanceOf(Uint8Array);

      const restored2 = pako.inflate(result2 as Uint8Array, { to: 'string' });

      expect(restored2).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT, TEST_EVENT]));
    });

    it('keeps using simple buffer if worker cannot be loaded', async function () {
      const workerString = 'window.triggerBlaError();';
      const workerBlob = new Blob([workerString]);
      const workerUrl = URL.createObjectURL(workerBlob);
      const worker = new Worker(workerUrl);
      const buffer = new EventBufferProxy(worker);

      buffer.addEvent(TEST_EVENT);
      buffer.addEvent(TEST_EVENT);

      expect(buffer.pendingEvents).toEqual([TEST_EVENT, TEST_EVENT]);

      // Finish before the worker is loaded
      const result = await buffer.finish();
      expect(typeof result).toBe('string');
      expect(result).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));

      // Now actually finish loading the worker - which triggers an error
      await buffer['_ensureWorkerIsLoaded']();

      buffer.addEvent(TEST_EVENT);
      buffer.addEvent(TEST_EVENT);
      buffer.addEvent(TEST_EVENT);

      expect(buffer.pendingEvents).toEqual([TEST_EVENT, TEST_EVENT, TEST_EVENT]);

      const result2 = await buffer.finish();
      expect(typeof result2).toBe('string');
      expect(result2).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT, TEST_EVENT]));
    });
  });
});
