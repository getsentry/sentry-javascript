import { filterAsync, forget } from '../src';

describe('forget', () => {
  const console = {
    error: jest.fn(),
    log: jest.fn(),
  };

  beforeEach(() => {
    global.console = (console as any) as Console;
  });

  test('logs rejections to console.error', done => {
    const error = new Error();
    forget(Promise.reject(error));

    setImmediate(() => {
      expect(console.error).toHaveBeenCalledWith(error);
      done();
    });
  });
});

describe('filterAsync', () => {
  test('filters with sync predicate', async () => {
    expect.assertions(1);
    const filtered = await filterAsync([1, 2, 3, 4], i => i > 2);
    expect(filtered).toEqual([3, 4]);
  });

  test('filters with async predicate', async () => {
    expect.assertions(1);

    const predicate = async (i: number) =>
      new Promise<boolean>(resolve =>
        setTimeout(() => {
          resolve(i > 2);
        }, i * 100),
      );

    const filtered = await filterAsync([1, 2, 3, 4], predicate);
    expect(filtered).toEqual([3, 4]);
  });

  test('passes filter arguments to the predicate', async () => {
    expect.assertions(1);

    const arr = [1];
    const predicate = jest.fn();

    await filterAsync(arr, predicate);
    expect(predicate).toHaveBeenCalledWith(1, 0, arr);
  });

  test('passes this to the predicate', async () => {
    expect.assertions(1);

    const that = {};
    await filterAsync(
      [1],
      function predicate(this: {}): boolean {
        expect(this).toBe(that);
        return false;
      },
      that,
    );
  });
});
