import { describe, it, expect } from 'vitest';
import { chainAndCopyPromiseLike } from '../../../src/utils/chain-and-copy-promiselike';

describe('chain and copy promiselike objects', () => {
  it('does no copying for normal promises', async () => {
    const p = new Promise<number>(res => res(1));
    Object.assign(p, { newProperty: true });
    let success = false;
    let error = false;
    const q = chainAndCopyPromiseLike(
      p,
      () => {
        success = true;
      },
      () => {
        error = true;
      },
    );
    expect(await q).toBe(1);
    //@ts-expect-error - this is not a normal prop on Promises
    expect(q.newProperty).toBe(undefined);
    expect(success).toBe(true);
    expect(error).toBe(false);
  });

  it('copies properties of non-Promise then-ables', async () => {
    class FakePromise<T extends unknown> {
      value: T;
      constructor(value: T) {
        this.value = value;
      }
      then(fn: (value: T) => unknown) {
        const newVal = fn(this.value);
        return new FakePromise(newVal);
      }
    }
    const p = new FakePromise(1) as PromiseLike<number>;
    Object.assign(p, { newProperty: true });
    let success = false;
    let error = false;
    const q = chainAndCopyPromiseLike(
      p,
      () => {
        success = true;
      },
      () => {
        error = true;
      },
    );
    expect(await q).toBe(1);
    //@ts-expect-error - this is not a normal prop on FakePromises
    expect(q.newProperty).toBe(true);
    expect(success).toBe(true);
    expect(error).toBe(false);
  });

  it('returns original when .then() returns undefined', () => {
    const original = {
      value: 42,
      then() {
        return undefined;
      },
      customMethod() {
        return 'hello';
      },
    } as unknown as PromiseLike<number> & { customMethod: () => string };

    const q = chainAndCopyPromiseLike(
      original,
      () => {},
      () => {},
    );

    expect(q).toBe(original);
    expect((q as typeof original).customMethod()).toBe('hello');
  });
});
