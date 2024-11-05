import { isMatchingPattern, stringMatchesSomePattern, truncate } from '../src/string';

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
  test('match using string substring if `requireExactStringMatch` not given', () => {
    expect(isMatchingPattern('foobar', 'foobar')).toEqual(true);
    expect(isMatchingPattern('foobar', 'foo')).toEqual(true);
    expect(isMatchingPattern('foobar', 'bar')).toEqual(true);
    expect(isMatchingPattern('foobar', 'nope')).toEqual(false);
  });

  test('match using string substring if `requireExactStringMatch` is `false`', () => {
    expect(isMatchingPattern('foobar', 'foobar', false)).toEqual(true);
    expect(isMatchingPattern('foobar', 'foo', false)).toEqual(true);
    expect(isMatchingPattern('foobar', 'bar', false)).toEqual(true);
    expect(isMatchingPattern('foobar', 'nope', false)).toEqual(false);
  });

  test('match using exact string match if `requireExactStringMatch` is `true`', () => {
    expect(isMatchingPattern('foobar', 'foobar', true)).toEqual(true);
    expect(isMatchingPattern('foobar', 'foo', true)).toEqual(false);
    expect(isMatchingPattern('foobar', 'nope', true)).toEqual(false);
  });

  test('matches when `value` contains `pattern` but not vice-versa', () => {
    expect(isMatchingPattern('foobar', 'foo')).toEqual(true);
    expect(isMatchingPattern('foobar', 'foobarbaz')).toEqual(false);
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

describe('stringMatchesSomePattern()', () => {
  test('match using string substring if `requireExactStringMatch` not given', () => {
    expect(stringMatchesSomePattern('foobar', ['foobar', 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('foobar', ['foo', 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('foobar', ['baz', 'nope'])).toEqual(false);
  });

  test('match using string substring if `requireExactStringMatch` is `false`', () => {
    expect(stringMatchesSomePattern('foobar', ['foobar', 'nope'], false)).toEqual(true);
    expect(stringMatchesSomePattern('foobar', ['foo', 'nope'], false)).toEqual(true);
    expect(stringMatchesSomePattern('foobar', ['baz', 'nope'], false)).toEqual(false);
  });

  test('match using exact string match if `requireExactStringMatch` is `true`', () => {
    expect(stringMatchesSomePattern('foobar', ['foobar', 'nope'], true)).toEqual(true);
    expect(stringMatchesSomePattern('foobar', ['foo', 'nope'], true)).toEqual(false);
    expect(stringMatchesSomePattern('foobar', ['baz', 'nope'], true)).toEqual(false);
  });

  test('matches when `testString` contains a pattern but not vice-versa', () => {
    expect(stringMatchesSomePattern('foobar', ['foo', 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('foobar', ['foobarbaz', 'nope'])).toEqual(false);
  });

  test('match using regexp test', () => {
    expect(stringMatchesSomePattern('foobar', [/^foo/, 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('foobar', [/foo/, 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('foobar', [/b.{1}r/, 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('foobar', [/^foo$/, 'nope'])).toEqual(false);
  });

  test('should match empty pattern as true', () => {
    expect(stringMatchesSomePattern('foo', ['', 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('bar', ['', 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('', ['', 'nope'])).toEqual(true);
  });

  test('should bail out with false when given non-string value', () => {
    expect(stringMatchesSomePattern(null as any, ['foo', 'nope'])).toEqual(false);
    expect(stringMatchesSomePattern(undefined as any, ['foo', 'nope'])).toEqual(false);
    expect(stringMatchesSomePattern({} as any, ['foo', 'nope'])).toEqual(false);
    expect(stringMatchesSomePattern([] as any, ['foo', 'nope'])).toEqual(false);
  });
});
