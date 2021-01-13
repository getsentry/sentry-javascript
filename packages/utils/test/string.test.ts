import { isMatchingPattern, truncate } from '../src/string';

describe('truncate()', () => {
  test('it works as expected', () => {
    expect(truncate('lolol', 3)).toEqual('lol...');
    expect(truncate('lolol', 10)).toEqual('lolol');
    expect(truncate('1'.repeat(1000), 300)).toHaveLength(303);
    expect(truncate(new Array(1000).join('f'), 0)).toEqual(new Array(1000).join('f'));
    expect(truncate(new Array(1000).join('f'), 0)).toEqual(new Array(1000).join('f'));
  });

  test('should bail out as an identity function when given non-string value', () => {
    expect(truncate(null as any, 3)).toEqual(null);
    expect(truncate(undefined as any, 3)).toEqual(undefined);
    expect(truncate({} as any, 3)).toEqual({});
    expect(truncate([] as any, 3)).toEqual([]);
  });
});

describe('isMatchingPattern()', () => {
  test('match using string substring', () => {
    expect(isMatchingPattern('foobar', 'foobar')).toEqual(true);
    expect(isMatchingPattern('foobar', 'foo')).toEqual(true);
    expect(isMatchingPattern('foobar', 'bar')).toEqual(true);
    expect(isMatchingPattern('foobar', 'nope')).toEqual(false);
  });

  test('match using regexp test', () => {
    expect(isMatchingPattern('foobar', /^foo/)).toEqual(true);
    expect(isMatchingPattern('foobar', /foo/)).toEqual(true);
    expect(isMatchingPattern('foobar', /b.{1}r/)).toEqual(true);
    expect(isMatchingPattern('foobar', /^foo$/)).toEqual(false);
  });

  test('should match empty pattern as true', () => {
    expect(isMatchingPattern('foo', '')).toEqual(true);
    expect(isMatchingPattern('bar', '')).toEqual(true);
    expect(isMatchingPattern('', '')).toEqual(true);
  });

  test('should bail out with false when given non-string value', () => {
    expect(isMatchingPattern(null as any, 'foo')).toEqual(false);
    expect(isMatchingPattern(undefined as any, 'foo')).toEqual(false);
    expect(isMatchingPattern({} as any, 'foo')).toEqual(false);
    expect(isMatchingPattern([] as any, 'foo')).toEqual(false);
  });
});
