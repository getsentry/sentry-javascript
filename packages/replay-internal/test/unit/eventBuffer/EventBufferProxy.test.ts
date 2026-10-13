/**
 * @vitest-environment jsdom
 */

import 'jsdom-worker';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBufferProxy } from '../../../src/eventBuffer/EventBufferProxy';
import { debug } from '../../../src/util/logger';
import { BASE_TIMESTAMP } from '../..';
import { decompress } from '../../utils/compression';
import { getTestEventIncremental } from '../../utils/getTestEvent';
import { createEventBuffer } from './../../../src/eventBuffer';

const TEST_EVENT = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });

/**
 * Worker stub that only answers when the test tells it to, so the buffer can be
 * destroyed while the switch to the compression worker is still in flight.
 */
class ControlledWorker extends EventTarget {
  public posted: Array<{ id: number; method: string }> = [];

  public postMessage(data: unknown): void {
    this.posted.push(data as { id: number; method: string });
  }

  public terminate(): void {
    // noop
  }

  /** Emit the message the worker sends once its script has loaded. */
  public sendReady(): void {
    this.dispatchEvent(new MessageEvent('message', { data: { success: true } }));
  }

  /** Answer all posted requests with an unsuccessful response. */
  public failAll(): void {
    this.posted.forEach(({ id, method }) => {
      this.dispatchEvent(new MessageEvent('message', { data: { id, method, success: false } }));
    });
  }
}

describe('Unit | eventBuffer | EventBufferProxy', () => {
  let consoleErrorSpy: MockInstance<any>;
  let exceptionSpy: MockInstance<any>;

  beforeEach(() => {
    // Avoid logging errors to console
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exceptionSpy = vi.spyOn(debug, 'exception').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    exceptionSpy.mockRestore();
  });

  it('waits for the worker to be loaded when calling finish', async function () {
    const buffer = createEventBuffer({
      useCompression: true,
    }) as EventBufferProxy;

    expect(buffer).toBeInstanceOf(EventBufferProxy);

    buffer.addEvent(TEST_EVENT);
    buffer.addEvent(TEST_EVENT);

    const result = await buffer.finish();
    expect(result).toBeInstanceOf(Uint8Array);
    const restored = decompress(result as Uint8Array);
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

    // Finish before the worker is loaded
    const result = await buffer.finish();
    expect(typeof result).toBe('string');
    expect(result).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));

    // Now actually finish loading the worker - which triggers an error
    await buffer.ensureWorkerIsLoaded();

    buffer.addEvent(TEST_EVENT);
    buffer.addEvent(TEST_EVENT);
    buffer.addEvent(TEST_EVENT);

    const result2 = await buffer.finish();
    expect(typeof result2).toBe('string');
    expect(result2).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT, TEST_EVENT]));
  });

  it('does not report an error if the worker is destroyed while switching buffers', async function () {
    const worker = new ControlledWorker();
    const buffer = new EventBufferProxy(worker as unknown as Worker);

    await buffer.addEvent(TEST_EVENT);

    worker.sendReady();
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    buffer.destroy();

    await buffer.ensureWorkerIsLoaded();
    expect(exceptionSpy).not.toHaveBeenCalled();
  });

  it('reports an error if adding events fails while switching buffers', async function () {
    const worker = new ControlledWorker();
    const buffer = new EventBufferProxy(worker as unknown as Worker);

    await buffer.addEvent(TEST_EVENT);

    worker.sendReady();
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    worker.failAll();

    await buffer.ensureWorkerIsLoaded();
    expect(exceptionSpy).toHaveBeenCalledWith(expect.any(Error), 'Failed to add events when switching buffers.');
  });
});
