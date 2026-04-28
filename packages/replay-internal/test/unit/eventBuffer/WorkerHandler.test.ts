/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { WorkerHandler } from '../../../src/eventBuffer/WorkerHandler';
import type { WorkerResponse } from '../../../src/types';

/**
 * Minimal Worker stub that lets tests control when responses dispatch and
 * track how many 'message' listeners are attached at any time. Real workers
 * are async; we model that with a queue we drain manually so the test can
 * assert on the listener count while requests are in flight.
 */
class MockWorker implements Pick<Worker, 'addEventListener' | 'removeEventListener' | 'postMessage' | 'terminate'> {
  public listenerCount = 0;
  public terminated = false;

  private _listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  private _pendingRequests: Array<{ id: number; method: string }> = [];

  public addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type)!.add(listener);
    if (type === 'message') this.listenerCount++;
  }

  public removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const set = this._listeners.get(type);
    if (set?.delete(listener) && type === 'message') this.listenerCount--;
  }

  public postMessage(data: unknown): void {
    const { id, method } = data as { id: number; method: string };
    this._pendingRequests.push({ id, method });
  }

  public terminate(): void {
    this.terminated = true;
  }

  /** Dispatch the queued response for a given id (FIFO order otherwise). */
  public flushOne(overrides?: Partial<WorkerResponse>): void {
    const next = this._pendingRequests.shift();
    if (!next) return;
    const response: WorkerResponse = {
      id: next.id,
      method: next.method,
      success: true,
      response: `result-${next.id}`,
      ...overrides,
    };
    this._dispatch('message', { data: response } as MessageEvent);
  }

  public flushAll(): void {
    while (this._pendingRequests.length > 0) this.flushOne();
  }

  public get pendingCount(): number {
    return this._pendingRequests.length;
  }

  private _dispatch(type: string, event: MessageEvent): void {
    const set = this._listeners.get(type);
    if (!set) return;
    for (const listener of set) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  }
}

const makeHandler = () => {
  const worker = new MockWorker();
  const handler = new WorkerHandler(worker as unknown as Worker);
  return { worker, handler };
};

describe('Unit | eventBuffer | WorkerHandler', () => {
  it('does not attach a new message listener per postMessage call (regression: #20547)', async () => {
    const { worker, handler } = makeHandler();

    // One listener is attached at construction time.
    expect(worker.listenerCount).toBe(1);

    // Fire a burst of in-flight requests. The pre-fix implementation attached
    // one listener per call, growing linearly; this would dispatch every
    // response to all attached listeners (O(n^2) main-thread work).
    const promises = Array.from({ length: 100 }, (_, i) => handler.postMessage('addEvent', `arg-${i}`));

    expect(worker.listenerCount).toBe(1);
    expect(worker.pendingCount).toBe(100);

    worker.flushAll();
    await Promise.all(promises);

    // Listener count is still 1 after the burst drains.
    expect(worker.listenerCount).toBe(1);
  });

  it('resolves concurrent postMessage calls with the correct response per id', async () => {
    const { worker, handler } = makeHandler();

    const p0 = handler.postMessage<string>('addEvent', 'a');
    const p1 = handler.postMessage<string>('addEvent', 'b');
    const p2 = handler.postMessage<string>('addEvent', 'c');

    worker.flushAll();

    await expect(p0).resolves.toBe('result-0');
    await expect(p1).resolves.toBe('result-1');
    await expect(p2).resolves.toBe('result-2');
  });

  it('rejects when the worker reports success: false', async () => {
    const { worker, handler } = makeHandler();

    const promise = handler.postMessage('addEvent', 'a');
    worker.flushOne({ success: false, response: 'boom' });

    await expect(promise).rejects.toThrow('Error in compression worker');
  });

  it('destroy() rejects pending requests and detaches the listener', async () => {
    const { worker, handler } = makeHandler();

    const p1 = handler.postMessage('addEvent', 'a');
    const p2 = handler.postMessage('addEvent', 'b');

    handler.destroy();

    await expect(p1).rejects.toThrow('Worker destroyed');
    await expect(p2).rejects.toThrow('Worker destroyed');
    expect(worker.terminated).toBe(true);
    expect(worker.listenerCount).toBe(0);
  });
});
