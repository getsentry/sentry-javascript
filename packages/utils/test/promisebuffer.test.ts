import { PromiseBuffer } from '../src/promisebuffer';
import { SyncPromise } from '../src/syncpromise';

describe('PromiseBuffer', () => {
  describe('add()', () => {
    test('no limit', () => {
      const buffer = new PromiseBuffer();
      const p = jest.fn(() => new SyncPromise(resolve => setTimeout(resolve)));
      void buffer.add(p);
      expect(buffer.length()).toEqual(1);
    });

    test('with limit', () => {
      const buffer = new PromiseBuffer(1);
      let task1;
      const producer1 = jest.fn(() => {
        task1 = new SyncPromise(resolve => setTimeout(resolve));
        return task1;
      });
      const producer2 = jest.fn(() => new SyncPromise(resolve => setTimeout(resolve)));
      expect(buffer.add(producer1)).toEqual(task1);
      void expect(buffer.add(producer2)).rejects.toThrowError();
      expect(buffer.length()).toEqual(1);
      expect(producer1).toHaveBeenCalled();
      expect(producer2).not.toHaveBeenCalled();
    });
  });

  describe('drain()', () => {
    test('without timeout', async () => {
      const buffer = new PromiseBuffer();
      for (let i = 0; i < 5; i++) {
        void buffer.add(() => new SyncPromise(resolve => setTimeout(resolve)));
      }
      expect(buffer.length()).toEqual(5);
      const result = await buffer.drain();
      expect(result).toEqual(true);
      expect(buffer.length()).toEqual(0);
    });

    test('with timeout', async () => {
      const buffer = new PromiseBuffer();
      for (let i = 0; i < 5; i++) {
        void buffer.add(() => new SyncPromise(resolve => setTimeout(resolve, 100)));
      }
      expect(buffer.length()).toEqual(5);
      const result = await buffer.drain(50);
      expect(result).toEqual(false);
    });

    test('on empty buffer', async () => {
      const buffer = new PromiseBuffer();
      expect(buffer.length()).toEqual(0);
      const result = await buffer.drain();
      expect(result).toEqual(true);
      expect(buffer.length()).toEqual(0);
    });
  });

  test('resolved promises should not show up in buffer length', async () => {
    const buffer = new PromiseBuffer();
    const producer = () => new SyncPromise(resolve => setTimeout(resolve));
    const task = buffer.add(producer);
    expect(buffer.length()).toEqual(1);
    await task;
    expect(buffer.length()).toEqual(0);
  });

  test('rejected promises should not show up in buffer length', async () => {
    const buffer = new PromiseBuffer();
    const producer = () => new SyncPromise((_, reject) => setTimeout(reject));
    const task = buffer.add(producer);
    expect(buffer.length()).toEqual(1);
    try {
      await task;
    } catch (_) {
      // no-empty
    }
    expect(buffer.length()).toEqual(0);
  });

  test('resolved task should give an access to the return value', async () => {
    const buffer = new PromiseBuffer<string>();
    const producer = () => new SyncPromise<string>(resolve => setTimeout(() => resolve('test')));
    const task = buffer.add(producer);
    const result = await task;
    expect(result).toEqual('test');
  });

  test('rejected task should give an access to the return value', async () => {
    expect.assertions(1);
    const buffer = new PromiseBuffer<string>();
    const producer = () => new SyncPromise<string>((_, reject) => setTimeout(() => reject(new Error('whoops'))));
    const task = buffer.add(producer);
    try {
      await task;
    } catch (e) {
      expect(e).toEqual(new Error('whoops'));
    }
  });
});
