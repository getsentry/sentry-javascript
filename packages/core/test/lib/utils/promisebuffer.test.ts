import { describe, expect, test, vi } from 'vitest';
import { makePromiseBuffer } from '../../../src/utils/promisebuffer';
import { rejectedSyncPromise, resolvedSyncPromise } from '../../../src/utils/syncpromise';

describe('PromiseBuffer', () => {
  describe('add()', () => {
    test('sync promises', () => {
      const buffer = makePromiseBuffer(1);
      let task1;
      const producer1 = vi.fn(() => {
        task1 = resolvedSyncPromise();
        return task1;
      });
      const producer2 = vi.fn(() => resolvedSyncPromise());
      expect(buffer.add(producer1)).toEqual(task1);
      void expect(buffer.add(producer2)).rejects.toThrowError();
      // This is immediately executed and removed again from the buffer
      expect(buffer.$.length).toEqual(0);
      expect(producer1).toHaveBeenCalled();
      expect(producer2).toHaveBeenCalled();
    });

    test('async promises', () => {
      const buffer = makePromiseBuffer(1);
      let task1;
      const producer1 = vi.fn(() => {
        task1 = new Promise(resolve => setTimeout(resolve, 1));
        return task1;
      });
      const producer2 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));
      expect(buffer.add(producer1)).toEqual(task1);
      void expect(buffer.add(producer2)).rejects.toThrowError();
      expect(buffer.$.length).toEqual(1);
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
      const buffer = makePromiseBuffer();

      const p1 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));
      const p2 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));
      const p3 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));
      const p4 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));
      const p5 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1)));

      [p1, p2, p3, p4, p5].forEach(p => {
        void buffer.add(p);
      });

      expect(buffer.$.length).toEqual(5);
      const result = await buffer.drain();
      expect(result).toEqual(true);
      expect(buffer.$.length).toEqual(0);

      expect(p1).toHaveBeenCalled();
      expect(p2).toHaveBeenCalled();
      expect(p3).toHaveBeenCalled();
      expect(p4).toHaveBeenCalled();
      expect(p5).toHaveBeenCalled();
    });

    test('drains all promises with timeout xxx', async () => {
      const buffer = makePromiseBuffer();

      const p1 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 2)));
      const p2 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 4)));
      const p3 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 6)));
      const p4 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 8)));
      const p5 = vi.fn(() => new Promise(resolve => setTimeout(resolve, 10)));

      [p1, p2, p3, p4, p5].forEach(p => {
        void buffer.add(p);
      });

      expect(p1).toHaveBeenCalled();
      expect(p2).toHaveBeenCalled();
      expect(p3).toHaveBeenCalled();
      expect(p4).toHaveBeenCalled();
      expect(p5).toHaveBeenCalled();

      expect(buffer.$.length).toEqual(5);
      const result = await buffer.drain(8);
      expect(result).toEqual(false);
      // p5 is still in the buffer
      expect(buffer.$.length).toEqual(1);

      // Now drain final item
      const result2 = await buffer.drain();
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
});
