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
});
