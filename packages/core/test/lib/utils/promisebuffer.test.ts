import { afterEach, describe, expect, test, vi } from 'vitest';
import { makePromiseBuffer } from '../../../src/utils/promisebuffer';
import { rejectedSyncPromise, resolvedSyncPromise } from '../../../src/utils/syncpromise';

describe('PromiseBuffer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  describe('add()', () => {
    test('enforces limit of promises', async () => {
      const buffer = makePromiseBuffer(5);

      const producer1 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));
      const producer2 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));
      const producer3 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));
      const producer4 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));
      const producer5 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));
      const producer6 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));

      void buffer.add(producer1);
      void buffer.add(producer2);
      void buffer.add(producer3);
      void buffer.add(producer4);
      void buffer.add(producer5);
      await expect(buffer.add(producer6)).rejects.toThrowError();

      expect(producer1).toHaveBeenCalledTimes(1);
      expect(producer2).toHaveBeenCalledTimes(1);
      expect(producer3).toHaveBeenCalledTimes(1);
      expect(producer4).toHaveBeenCalledTimes(1);
      expect(producer5).toHaveBeenCalledTimes(1);
      expect(producer6).not.toHaveBeenCalled();

      expect(buffer.$.length).toEqual(5);

      await buffer.drain();

      expect(buffer.$.length).toEqual(0);

      expect(producer1).toHaveBeenCalledTimes(1);
      expect(producer2).toHaveBeenCalledTimes(1);
      expect(producer3).toHaveBeenCalledTimes(1);
      expect(producer4).toHaveBeenCalledTimes(1);
      expect(producer5).toHaveBeenCalledTimes(1);
      expect(producer6).not.toHaveBeenCalled();
    });

    test('sync promises', async () => {
      const buffer = makePromiseBuffer(1);
      let task1;
      const producer1 = vi.fn(() => {
        task1 = resolvedSyncPromise();
        return task1;
      });
      const producer2 = vi.fn(() => resolvedSyncPromise());
      expect(buffer.add(producer1)).toEqual(task1);
      const add2 = buffer.add(producer2);

      // This is immediately executed and removed again from the buffer
      expect(buffer.$.length).toEqual(0);

      await expect(add2).resolves.toBeUndefined();

      expect(producer1).toHaveBeenCalled();
      expect(producer2).toHaveBeenCalled();
    });

    test('async promises', async () => {
      const buffer = makePromiseBuffer(1);
      let task1;
      const producer1 = vi.fn(() => {
        task1 = new Promise(resolve => setTimeout(resolve, 1));
        return task1;
      });
      const producer2 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));
      expect(buffer.add(producer1)).toEqual(task1);
      const add2 = buffer.add(producer2);

      expect(buffer.$.length).toEqual(1);

      await expect(add2).rejects.toThrowError();

      expect(producer1).toHaveBeenCalled();
      expect(producer2).not.toHaveBeenCalled();
    });

    test('handles multiple equivalent promises', async () => {
      const buffer = makePromiseBuffer(10);

      const promise = new Promise(resolve => setTimeout(resolve, 1));

      const producer = vi.fn(() => promise);
      const producer2 = vi.fn(() => promise);

      expect(buffer.add(producer)).toEqual(promise);
      expect(buffer.add(producer2)).toEqual(promise);

      expect(buffer.$.length).toEqual(1);

      expect(producer).toHaveBeenCalled();
      expect(producer2).toHaveBeenCalled();

      await buffer.drain();

      expect(buffer.$.length).toEqual(0);
    });
  });

  describe('drain()', () => {
    test('drains all promises without timeout', async () => {
      vi.useFakeTimers();

      const buffer = makePromiseBuffer();

      const p1 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 10)));
      const p2 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 10)));
      const p3 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 10)));
      const p4 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 10)));
      const p5 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 10)));

      [p1, p2, p3, p4, p5].forEach(p => {
        void buffer.add(p);
      });

      expect(buffer.$.length).toEqual(5);

      const drainPromise = buffer.drain();

      // Advance time to resolve all promises
      await vi.advanceTimersByTimeAsync(10);

      const result = await drainPromise;
      expect(result).toEqual(true);
      expect(buffer.$.length).toEqual(0);

      expect(p1).toHaveBeenCalled();
      expect(p2).toHaveBeenCalled();
      expect(p3).toHaveBeenCalled();
      expect(p4).toHaveBeenCalled();
      expect(p5).toHaveBeenCalled();
    });

    test('drains all promises with timeout', async () => {
      vi.useFakeTimers();

      const buffer = makePromiseBuffer();

      const p1 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 20)));
      const p2 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 40)));
      const p3 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 60)));
      const p4 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 80)));
      const p5 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));

      [p1, p2, p3, p4, p5].forEach(p => {
        void buffer.add(p);
      });

      expect(p1).toHaveBeenCalled();
      expect(p2).toHaveBeenCalled();
      expect(p3).toHaveBeenCalled();
      expect(p4).toHaveBeenCalled();
      expect(p5).toHaveBeenCalled();

      expect(buffer.$.length).toEqual(5);

      // Start draining with a 50ms timeout
      const drainPromise = buffer.drain(50);

      // Advance time by 50ms - this will:
      // - Resolve p1 (20ms) and p2 (40ms)
      // - Trigger the drain timeout (50ms)
      // - p3, p4, p5 are still pending
      await vi.advanceTimersByTimeAsync(50);

      const result = await drainPromise;
      expect(result).toEqual(false);

      // p3, p4 & p5 are still in the buffer
      expect(buffer.$.length).toEqual(3);

      // Now drain remaining items without timeout
      const drainPromise2 = buffer.drain();

      // Advance time to resolve remaining promises
      await vi.advanceTimersByTimeAsync(100);

      const result2 = await drainPromise2;
      expect(result2).toEqual(true);
      expect(buffer.$.length).toEqual(0);
    });

    test('on empty buffer', async () => {
      const buffer = makePromiseBuffer();
      expect(buffer.$.length).toEqual(0);
      const result = await buffer.drain();
      expect(result).toEqual(true);
      expect(buffer.$.length).toEqual(0);
    });

    test('resolves even if one of the promises rejects', async () => {
      const buffer = makePromiseBuffer();
      const p1 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));
      const p2 = vi.fn(() => new Promise((_, reject) => setTimeout(() => reject(new Error('whoops')), 1)));
      void buffer.add(p1);
      void buffer.add(p2);

      const result = await buffer.drain();
      expect(result).toEqual(true);
      expect(buffer.$.length).toEqual(0);

      expect(p1).toHaveBeenCalled();
      expect(p2).toHaveBeenCalled();
    });
  });

  test('resolved promises should not show up in buffer length', async () => {
    const buffer = makePromiseBuffer();
    const producer = () => new Promise(resolve => setTimeout(resolve, 1));
    const task = buffer.add(producer);
    expect(buffer.$.length).toEqual(1);
    await task;
    expect(buffer.$.length).toEqual(0);
  });

  test('rejected promises should not show up in buffer length', async () => {
    const buffer = makePromiseBuffer();
    const error = new Error('whoops');
    const producer = () => new Promise((_, reject) => setTimeout(() => reject(error), 1));
    const task = buffer.add(producer);
    expect(buffer.$.length).toEqual(1);

    await expect(task).rejects.toThrow(error);
    expect(buffer.$.length).toEqual(0);
  });

  test('resolved task should give an access to the return value', async () => {
    const buffer = makePromiseBuffer<string>();
    const producer = () => resolvedSyncPromise('test');
    const task = buffer.add(producer);
    const result = await task;
    expect(result).toEqual('test');
  });

  test('rejected task should give an access to the return value', async () => {
    expect.assertions(1);
    const buffer = makePromiseBuffer<string>();
    const producer = () => rejectedSyncPromise(new Error('whoops'));
    const task = buffer.add(producer);
    try {
      await task;
    } catch (e) {
      expect(e).toEqual(new Error('whoops'));
    }
  });

  test('drain returns immediately when buffer is empty', async () => {
    const buffer = makePromiseBuffer();
    expect(buffer.$.length).toEqual(0);

    const startTime = Date.now();
    const result = await buffer.drain(5000);
    const elapsed = Date.now() - startTime;

    expect(result).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });
});
