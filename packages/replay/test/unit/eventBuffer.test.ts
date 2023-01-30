import 'jsdom-worker';

import pako from 'pako';

import { EventBufferProxy } from '../../src/eventBuffer/EventBufferProxy';
import { createEventBuffer } from './../../src/eventBuffer';
import { BASE_TIMESTAMP } from './../index';

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

      // Checkout triggers clear
      buffer.clear();
      buffer.addEvent(TEST_EVENT, true);
      const result = await buffer.finish();

      expect(result).toEqual(JSON.stringify([TEST_EVENT]));
    });

    it('adds multiple checkout events in correct order', async function () {
      const buffer = createEventBuffer({ useCompression: false });

      buffer.addEvent({ data: { order: 1 }, timestamp: BASE_TIMESTAMP, type: 2 });
      buffer.addEvent({ data: { order: 2 }, timestamp: BASE_TIMESTAMP, type: 3 });
      buffer.addEvent({ data: { order: 3 }, timestamp: BASE_TIMESTAMP, type: 3 });
      buffer.addEvent({ data: { order: 4 }, timestamp: BASE_TIMESTAMP, type: 2 }, true);
      buffer.addEvent({ data: { order: 5 }, timestamp: BASE_TIMESTAMP, type: 3 });
      buffer.addEvent({ data: { order: 6 }, timestamp: BASE_TIMESTAMP, type: 3 });
      buffer.addEvent({ data: { order: 7 }, timestamp: BASE_TIMESTAMP, type: 2 }, true);
      buffer.addEvent({ data: { order: 8 }, timestamp: BASE_TIMESTAMP, type: 3 });

      expect(buffer.pendingEvents.map(event => (event as { data: { order: number } }).data.order)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8,
      ]);
      expect(buffer.pendingLength).toEqual(8);

      buffer.clear(true);

      expect(buffer.pendingEvents.map(event => (event as { data: { order: number } }).data.order)).toEqual([7, 8]);
      expect(buffer.pendingLength).toEqual(2);
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
      await buffer.ensureWorkerIsLoaded();

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
      await buffer.ensureWorkerIsLoaded();

      buffer.addEvent(TEST_EVENT);
      buffer.addEvent(TEST_EVENT);

      // Checkout triggers clear
      buffer.clear();
      buffer.addEvent({ ...TEST_EVENT, type: 2 }), true;

      const result = await buffer.finish();
      expect(result).toBeInstanceOf(Uint8Array);
      const restored = pako.inflate(result as Uint8Array, { to: 'string' });

      expect(restored).toEqual(JSON.stringify([{ ...TEST_EVENT, type: 2 }]));
    });

    it('adds multiple checkout events in correct order', async function () {
      const buffer = createEventBuffer({
        useCompression: true,
      }) as EventBufferProxy;

      expect(buffer).toBeInstanceOf(EventBufferProxy);

      // Ensure worker is ready
      await buffer.ensureWorkerIsLoaded();

      buffer.addEvent({ data: { order: 1 }, timestamp: BASE_TIMESTAMP, type: 2 });
      buffer.addEvent({ data: { order: 2 }, timestamp: BASE_TIMESTAMP, type: 3 });
      buffer.addEvent({ data: { order: 3 }, timestamp: BASE_TIMESTAMP, type: 3 });
      buffer.addEvent({ data: { order: 4 }, timestamp: BASE_TIMESTAMP, type: 2 }, true);
      buffer.addEvent({ data: { order: 5 }, timestamp: BASE_TIMESTAMP, type: 3 });
      buffer.addEvent({ data: { order: 6 }, timestamp: BASE_TIMESTAMP, type: 3 });
      buffer.addEvent({ data: { order: 7 }, timestamp: BASE_TIMESTAMP, type: 2 }, true);
      buffer.addEvent({ data: { order: 8 }, timestamp: BASE_TIMESTAMP, type: 3 });

      expect(buffer.pendingEvents.map(event => (event as { data: { order: number } }).data.order)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8,
      ]);
      expect(buffer.pendingLength).toEqual(8);

      const result = await buffer.finish();
      expect(result).toBeInstanceOf(Uint8Array);
      const restored = pako.inflate(result as Uint8Array, { to: 'string' });

      const orderList = JSON.parse(restored).map((event: { data: { order: number } }) => event.data.order);

      expect(orderList).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('clears with keepLastCheckout=true', async function () {
      const buffer = createEventBuffer({
        useCompression: true,
      }) as EventBufferProxy;

      expect(buffer).toBeInstanceOf(EventBufferProxy);

      // Ensure worker is ready
      await buffer.ensureWorkerIsLoaded();

      buffer.addEvent({ data: { order: 1 }, timestamp: BASE_TIMESTAMP, type: 2 });
      buffer.addEvent({ data: { order: 2 }, timestamp: BASE_TIMESTAMP, type: 3 });
      buffer.addEvent({ data: { order: 3 }, timestamp: BASE_TIMESTAMP, type: 3 });
      buffer.addEvent({ data: { order: 4 }, timestamp: BASE_TIMESTAMP, type: 2 }, true);
      buffer.addEvent({ data: { order: 5 }, timestamp: BASE_TIMESTAMP, type: 3 });
      buffer.addEvent({ data: { order: 6 }, timestamp: BASE_TIMESTAMP, type: 3 });
      buffer.addEvent({ data: { order: 7 }, timestamp: BASE_TIMESTAMP, type: 2 }, true);
      buffer.addEvent({ data: { order: 8 }, timestamp: BASE_TIMESTAMP, type: 3 });

      expect(buffer.pendingEvents.map(event => (event as { data: { order: number } }).data.order)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8,
      ]);

      buffer.clear(true);

      expect(buffer.pendingEvents.map(event => (event as { data: { order: number } }).data.order)).toEqual([7, 8]);

      const result = await buffer.finish();
      expect(result).toBeInstanceOf(Uint8Array);
      const restored = pako.inflate(result as Uint8Array, { to: 'string' });

      const orderList = JSON.parse(restored).map((event: { data: { order: number } }) => event.data.order);

      expect(orderList).toEqual([7, 8]);
    });

    it('handles an error when compressing the payload', async function () {
      const buffer = createEventBuffer({
        useCompression: true,
      }) as EventBufferProxy;

      expect(buffer).toBeInstanceOf(EventBufferProxy);

      // Ensure worker is ready
      await buffer.ensureWorkerIsLoaded();

      buffer.addEvent(TEST_EVENT);
      buffer.addEvent(TEST_EVENT);

      // @ts-ignore Mock this private so it triggers an error
      const postMessageSpy = jest.spyOn(buffer._compression, '_postMessage').mockImplementation(() => {
        return Promise.reject('test worker error');
      });

      const result = await buffer.finish();

      expect(postMessageSpy).toHaveBeenCalledTimes(1);

      expect(result).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));
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

      buffer.addEvent(TEST_EVENT);
      buffer.addEvent(TEST_EVENT);

      // @ts-ignore Mock this private so it triggers an error
      const postMessageSpy = jest.spyOn(buffer._compression, '_postMessage').mockImplementation(() => {
        return Promise.reject('test worker error');
      });

      const result = await buffer.finish();

      expect(postMessageSpy).toHaveBeenCalledTimes(1);

      expect(result).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));
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

    it('waits for the worker to be loaded when calling finish', async function () {
      const buffer = createEventBuffer({
        useCompression: true,
      }) as EventBufferProxy;

      expect(buffer).toBeInstanceOf(EventBufferProxy);

      buffer.addEvent(TEST_EVENT);
      buffer.addEvent(TEST_EVENT);

      expect(buffer.pendingEvents).toEqual([TEST_EVENT, TEST_EVENT]);

      const result = await buffer.finish();
      expect(result).toBeInstanceOf(Uint8Array);
      const restored = pako.inflate(result as Uint8Array, { to: 'string' });
      expect(restored).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));
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
      await buffer.ensureWorkerIsLoaded();

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
