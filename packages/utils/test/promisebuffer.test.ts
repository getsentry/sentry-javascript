import { PromiseBuffer } from '../src/promisebuffer';

// tslint:disable:no-floating-promises

describe('PromiseBuffer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  describe('add()', () => {
    test('no limit', () => {
      const q = new PromiseBuffer<void>();
      const p = new Promise<void>(resolve => setTimeout(resolve, 1));
      q.add(p);
      expect(q.length()).toBe(1);
    });
    test('with limit', () => {
      const q = new PromiseBuffer<void>(1);
      const p = new Promise<void>(resolve => setTimeout(resolve, 1));
      expect(q.add(p)).toEqual(p);
      expect(q.add(new Promise<void>(resolve => setTimeout(resolve, 1)))).rejects.toThrowError();
      expect(q.length()).toBe(1);
    });
  });

  test('resolved promises should not show up in buffer length', async () => {
    expect.assertions(2);
    const q = new PromiseBuffer<void>();
    const p = new Promise<void>(resolve => setTimeout(resolve, 1));
    q.add(p).then(() => {
      expect(q.length()).toBe(0);
    });
    expect(q.length()).toBe(1);
    jest.runAllTimers();
  });

  test('receive promise result outside and from buffer', async () => {
    expect.assertions(4);
    const q = new PromiseBuffer<string>();
    const p = new Promise<string>(resolve =>
      setTimeout(() => {
        resolve('test');
      }, 1),
    );
    q.add(p).then(result => {
      expect(q.length()).toBe(0);
      expect(result).toBe('test');
    });
    expect(q.length()).toBe(1);
    p.then(result => {
      expect(result).toBe('test');
    });
    jest.runAllTimers();
  });

  test('drain()', async () => {
    expect.assertions(3);
    const q = new PromiseBuffer<void>();
    for (let i = 0; i < 5; i++) {
      const p = new Promise<void>(resolve => setTimeout(resolve, 1));
      q.add(p);
    }
    expect(q.length()).toBe(5);
    q.drain().then(result => {
      expect(result).toBeTruthy();
      expect(q.length()).toBe(0);
    });
    jest.runAllTimers();
  });

  test('drain() with timeout', async () => {
    expect.assertions(2);
    const q = new PromiseBuffer<void>();
    for (let i = 0; i < 5; i++) {
      const p = new Promise<void>(resolve => setTimeout(resolve, 100));
      q.add(p);
    }
    expect(q.length()).toBe(5);
    q.drain(50).then(result => {
      expect(result).toBeFalsy();
    });
    jest.runAllTimers();
  });

  test('drain() on empty buffer', async () => {
    expect.assertions(3);
    const q = new PromiseBuffer<void>();
    expect(q.length()).toBe(0);
    q.drain().then(result => {
      expect(result).toBeTruthy();
      expect(q.length()).toBe(0);
    });
    jest.runAllTimers();
  });

  test('rejecting', async () => {
    expect.assertions(1);
    const q = new PromiseBuffer<void>();
    const p = new Promise<void>((_, reject) => setTimeout(reject, 1));
    jest.runAllTimers();
    return q.add(p).catch(() => {
      expect(true).toBe(true);
    });
  });
});
