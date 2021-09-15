import { JSDOM } from 'jsdom';

import * as crossPlatformUtils from '../src/crossplatform';
import { base64ToUnicode, GlobalBase64Helpers, isMatchingPattern, truncate, unicodeToBase64 } from '../src/string';

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

// these functions use different built-ins depending on whether the code is running in Node or in the browser, so test
// both environments
describe.each(['node', 'browser'])('base64ToUnicode/unicodeToBase64 (%s)', (testEnv: string) => {
  const unicodeString = 'Dogs are great!';
  const base64String = 'RG9ncyBhcmUgZ3JlYXQh';

  let atobSpy: jest.SpyInstance, btoaSpy: jest.SpyInstance, bufferSpy: jest.SpyInstance;

  beforeAll(() => {
    const { Buffer, ...nonBufferGlobals } = global as typeof global & GlobalBase64Helpers;

    // By default, all tests in run in a node environment. To mimic the behavior of a browser, we need to adjust what is
    // available globally.
    if (testEnv === 'browser') {
      const { window } = new JSDOM('', { url: 'http://dogs.are.great/' });

      atobSpy = jest.spyOn(window, 'atob');
      btoaSpy = jest.spyOn(window, 'btoa');

      jest
        .spyOn(crossPlatformUtils, 'getGlobalObject')
        .mockReturnValue({ atob: atobSpy, btoa: btoaSpy, ...nonBufferGlobals } as any);
    }
    // no need to adjust what's in `global`, but set up a spy so we can make sure the right functions are getting called
    // in the right environments
    else {
      bufferSpy = jest.spyOn(Buffer, 'from');
    }
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('meta: uses the right mock given test env', () => {
    unicodeToBase64(unicodeString);
    base64ToUnicode(base64String);
    if (testEnv === 'browser') {
      expect(atobSpy).toHaveBeenCalled();
      expect(btoaSpy).toHaveBeenCalled();
    } else {
      expect(bufferSpy).toHaveBeenCalled();
    }
  });

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
