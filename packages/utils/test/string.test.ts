import { base64ToUnicode, isMatchingPattern, truncate, unicodeToBase64 } from '../src/string';

// See https://tools.ietf.org/html/rfc4648#section-4 for base64 spec
// eslint-disable-next-line no-useless-escape
const BASE64_REGEX = /([a-zA-Z0-9+/]{4})*(|([a-zA-Z0-9+/]{3}=)|([a-zA-Z0-9+/]{2}==))/;

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

// NOTE: These tests are copied (and adapted for chai syntax) to `string.test.ts` in `@sentry/browser`. The
// base64-conversion functions have a different implementation in browser and node, so they're copied there to prove
// they work in a real live browser. If you make changes here, make sure to also port them over to that copy.
describe('base64ToUnicode/unicodeToBase64', () => {
  const unicodeString = 'Dogs are great!';
  const base64String = 'RG9ncyBhcmUgZ3JlYXQh';

  test('converts to valid base64', () => {
    expect(BASE64_REGEX.test(unicodeToBase64(unicodeString))).toBe(true);
  });

  test('works as expected (and conversion functions are inverses)', () => {
    expect(unicodeToBase64(unicodeString)).toEqual(base64String);
    expect(base64ToUnicode(base64String)).toEqual(unicodeString);
  });

  test('can handle and preserve multi-byte characters in original string', () => {
    ['🐶', 'Καλό κορίτσι, Μάιζεϊ!', 'Of margir hundar! Ég geri ráð fyrir að ég þurfi stærra rúm.'].forEach(orig => {
      expect(() => {
        unicodeToBase64(orig);
      }).not.toThrowError();
      expect(base64ToUnicode(unicodeToBase64(orig))).toEqual(orig);
    });
  });

  test('throws an error when given invalid input', () => {
    expect(() => {
      unicodeToBase64(null as any);
    }).toThrowError('Unable to convert to base64');
    expect(() => {
      unicodeToBase64(undefined as any);
    }).toThrowError('Unable to convert to base64');
    expect(() => {
      unicodeToBase64({} as any);
    }).toThrowError('Unable to convert to base64');

    expect(() => {
      base64ToUnicode(null as any);
    }).toThrowError('Unable to convert from base64');
    expect(() => {
      base64ToUnicode(undefined as any);
    }).toThrowError('Unable to convert from base64');
    expect(() => {
      base64ToUnicode({} as any);
    }).toThrowError('Unable to convert from base64');

    // Note that by design, in node base64 encoding and decoding will accept any string, whether or not it's valid
    // base64, by ignoring all invalid characters, including whitespace. Therefore, no wacky strings have been included
    // here because they don't actually error.
  });
});
