import { describe, expect, it } from 'vitest';
import { uniq } from '../../../src/utils/array';

describe('Unit | util | uniq', () => {
  it('removes duplicate values', () => {
    expect(uniq([1, 1, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it('preserves first-occurrence order', () => {
    expect(uniq(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
  });

  it('returns an empty array for an empty input', () => {
    expect(uniq([])).toEqual([]);
  });

  it('returns a new array and does not mutate the input', () => {
    const input = [1, 2, 2];
    const result = uniq(input);
    expect(result).not.toBe(input);
    expect(input).toEqual([1, 2, 2]);
  });

  it('dedupes by identity, keeping distinct object references', () => {
    const a = { id: 1 };
    const b = { id: 1 };
    expect(uniq([a, a, b])).toEqual([a, b]);
  });
});
