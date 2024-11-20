import type { NestedArray } from '../../src/utils-hoist/array';
import { flatten } from '../../src/utils-hoist/array';

describe('flatten', () => {
  it('should return the same array when input is a flat array', () => {
    const input = [1, 2, 3, 4];
    const expected = [1, 2, 3, 4];
    expect(flatten(input)).toEqual(expected);
  });

  it('should flatten a nested array of numbers', () => {
    const input = [[1, 2, [3]], 4];
    const expected = [1, 2, 3, 4];
    expect(flatten(input)).toEqual(expected);
  });

  it('should flatten a nested array of strings', () => {
    const input = [
      ['Hello', 'World'],
      ['How', 'Are', 'You'],
    ];
    const expected = ['Hello', 'World', 'How', 'Are', 'You'];
    expect(flatten(input)).toEqual(expected);
  });

  it('should flatten a nested array of objects', () => {
    const input: NestedArray<{ a: number; b?: number } | { b: number; a?: number }> = [
      [{ a: 1 }, { b: 2 }],
      [{ a: 3 }, { b: 4 }],
    ];
    const expected = [{ a: 1 }, { b: 2 }, { a: 3 }, { b: 4 }];
    expect(flatten(input)).toEqual(expected);
  });

  it('should flatten a mixed type array', () => {
    const input: NestedArray<string | { b: number }> = [['a', { b: 2 }, 'c'], 'd'];
    const expected = ['a', { b: 2 }, 'c', 'd'];
    expect(flatten(input)).toEqual(expected);
  });

  it('should flatten a deeply nested array', () => {
    const input = [1, [2, [3, [4, [5]]]]];
    const expected = [1, 2, 3, 4, 5];
    expect(flatten(input)).toEqual(expected);
  });

  it('should return an empty array when input is empty', () => {
    const input: any[] = [];
    const expected: any[] = [];
    expect(flatten(input)).toEqual(expected);
  });

  it('should return the same array when input is a flat array', () => {
    const input = [1, 'a', { b: 2 }, 'c', 3];
    const expected = [1, 'a', { b: 2 }, 'c', 3];
    expect(flatten(input)).toEqual(expected);
  });
});
