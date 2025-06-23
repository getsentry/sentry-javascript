import { describe, expect, it } from 'vitest';
import { merge } from '../../../src/utils/merge';

describe('merge', () => {
  it('works with empty objects', () => {
    const oldData = {};
    const newData = {};

    const actual = merge(oldData, newData);

    expect(actual).toEqual({});
    expect(actual).toBe(oldData);
    expect(actual).not.toBe(newData);
  });

  it('works with empty merge object', () => {
    const oldData = { aa: 'aha' };
    const newData = {};

    const actual = merge(oldData, newData);

    expect(actual).toEqual({ aa: 'aha' });
    expect(actual).toBe(oldData);
    expect(actual).not.toBe(newData);
  });

  it('works with arbitrary data', () => {
    const oldData = {
      old1: 'old1',
      old2: 'old2',
      obj: { key: 'value1', key1: 'value1', deep: { key: 'value' } },
    } as any;
    const newData = {
      new1: 'new1',
      old2: 'new2',
      obj: { key2: 'value2', key: 'value2', deep: { key2: 'value2' } },
    } as any;

    const actual = merge(oldData, newData);

    expect(actual).toEqual({
      old1: 'old1',
      old2: 'new2',
      new1: 'new1',
      obj: {
        key2: 'value2',
        key: 'value2',
        key1: 'value1',
        deep: { key2: 'value2' },
      },
    });
    expect(actual).not.toBe(oldData);
    expect(actual).not.toBe(newData);
  });

  it.each([
    [undefined, { a: 'aa' }, { a: 'aa' }],
    [{ a: 'aa' }, undefined, undefined],
    [{ a: 'aa' }, null, null],
    [{ a: 'aa' }, { a: undefined }, { a: undefined }],
    [{ a: 'aa' }, { a: null }, { a: null }],
    [{ a: 'aa' }, { a: '' }, { a: '' }],
    [
      { a0: { a1: { a2: { a3: { a4: 'a4a' }, a3a: 'a3a' }, a2a: 'a2a' }, a1a: 'a1a' }, a0a: 'a0a' },
      { a0: { a1: { a2: { a3: { a4: 'a4b' }, a3b: 'a3b' }, a2b: 'a2b' }, a1b: 'a1b' }, a0b: 'a0b' },
      {
        a0: { a1: { a2: { a3: { a4: 'a4b' }, a3b: 'a3b' }, a2b: 'a2b' }, a1b: 'a1b', a1a: 'a1a' },
        a0b: 'a0b',
        a0a: 'a0a',
      },
    ],
  ])('works with %j and %j', (oldData, newData, expected) => {
    const actual = merge(oldData, newData as any);
    expect(actual).toEqual(expected);
  });
});
