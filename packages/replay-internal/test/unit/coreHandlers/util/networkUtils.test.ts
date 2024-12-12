/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import { NETWORK_BODY_MAX_SIZE } from '../../../../src/constants';
import {
  buildNetworkRequestOrResponse,
  getBodySize,
  getBodyString,
  getFullUrl,
  parseContentLengthHeader,
} from '../../../../src/coreHandlers/util/networkUtils';
import { useFakeTimers } from '../../../utils/use-fake-timers';

useFakeTimers();

describe('Unit | coreHandlers | util | networkUtils', () => {
  describe('parseContentLengthHeader()', () => {
    it.each([
      [undefined, undefined],
      [null, undefined],
      ['', undefined],
      ['12', 12],
      ['abc', undefined],
    ])('works with %s header value', (headerValue, size) => {
      expect(parseContentLengthHeader(headerValue)).toBe(size);
    });
  });

  describe('getBodySize()', () => {
    it('works with empty body', () => {
      expect(getBodySize(undefined)).toBe(undefined);
      expect(getBodySize(null)).toBe(undefined);
      expect(getBodySize('')).toBe(undefined);
    });

    it('works with string body', () => {
      expect(getBodySize('abcd')).toBe(4);
      // Emojis are correctly counted as multiple characters
      expect(getBodySize('With emoji: 😈')).toBe(16);
    });

    it('works with URLSearchParams', () => {
      const params = new URLSearchParams();
      params.append('name', 'Jane');
      params.append('age', '42');
      params.append('emoji', '😈');

      expect(getBodySize(params)).toBe(35);
    });

    it('works with FormData', () => {
      const formData = new FormData();
      formData.append('name', 'Jane');
      formData.append('age', '42');
      formData.append('emoji', '😈');

      expect(getBodySize(formData)).toBe(35);
    });

    it('works with Blob', () => {
      const blob = new Blob(['<html>Hello world: 😈</html>'], { type: 'text/html' });

      expect(getBodySize(blob)).toBe(30);
    });

    it('works with ArrayBuffer', () => {
      const arrayBuffer = new ArrayBuffer(8);

      expect(getBodySize(arrayBuffer)).toBe(8);
    });
  });

  describe('buildNetworkRequestOrResponse', () => {
    it.each([
      ['just text', 'just text', undefined],
      ['[invalid JSON]', '[invalid JSON]', undefined],
      ['{invalid JSON}', '{invalid JSON}', undefined],
      ['[]', [], undefined],
      [JSON.stringify([1, 'a', true, null, undefined]), [1, 'a', true, null, null], undefined],
      [JSON.stringify([1, [2, [3, [4, [5, [6, [7, [8]]]]]]]]), [1, [2, [3, [4, [5, [6, [7, [8]]]]]]]], undefined],
      ['{}', {}, undefined],
      [
        JSON.stringify({ a: 1, b: true, c: 'yes', d: null, e: undefined }),
        { a: 1, b: true, c: 'yes', d: null, e: undefined },
        undefined,
      ],
      [
        JSON.stringify({
          a: 1,
          b: {
            c: 2,
            d: {
              e: 3,
              f: {
                g: 4,
                h: {
                  i: 5,
                  j: {
                    k: 6,
                    l: {
                      m: 7,
                      n: {
                        o: 8,
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        {
          a: 1,
          b: {
            c: 2,
            d: {
              e: 3,
              f: {
                g: 4,
                h: {
                  i: 5,
                  j: {
                    k: 6,
                    l: {
                      m: 7,
                      n: {
                        o: 8,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        undefined,
      ],
      [
        JSON.stringify({
          data: {
            user: {
              name: 'John',
              age: 42,
              friends: [
                {
                  name: 'Jane',
                },
                {
                  name: 'Bob',
                  children: [
                    { name: 'Alice' },
                    {
                      name: 'Rose',
                      hobbies: [{ name: 'Dancing' }, { name: 'Programming' }, { name: 'Dueling' }],
                    },
                  ],
                },
              ],
            },
          },
        }),
        {
          data: {
            user: {
              name: 'John',
              age: 42,
              friends: [
                {
                  name: 'Jane',
                },
                {
                  name: 'Bob',
                  children: [
                    { name: 'Alice' },
                    {
                      name: 'Rose',
                      hobbies: [{ name: 'Dancing' }, { name: 'Programming' }, { name: 'Dueling' }],
                    },
                  ],
                },
              ],
            },
          },
        },
        undefined,
      ],
    ])('works with %s', (input, expectedBody, expectedMeta) => {
      const actual = buildNetworkRequestOrResponse({}, 1, input);

      expect(actual).toEqual({ size: 1, headers: {}, body: expectedBody, _meta: expectedMeta });
    });

    it.each([
      [
        'large JSON string',
        JSON.stringify({
          aa: 'a'.repeat(NETWORK_BODY_MAX_SIZE + 10),
        }),
        JSON.stringify({
          aa: 'a'.repeat(NETWORK_BODY_MAX_SIZE + 10),
        }).slice(0, NETWORK_BODY_MAX_SIZE),
        { warnings: ['MAYBE_JSON_TRUNCATED'] },
      ],
      [
        'large plain string',
        'a'.repeat(NETWORK_BODY_MAX_SIZE + 10),
        `${'a'.repeat(NETWORK_BODY_MAX_SIZE)}…`,
        { warnings: ['TEXT_TRUNCATED'] },
      ],
      [
        'large invalid JSON string',
        `{--${JSON.stringify({
          aa: 'a'.repeat(NETWORK_BODY_MAX_SIZE + 10),
        })}`,

        `{--${JSON.stringify({
          aa: 'a'.repeat(NETWORK_BODY_MAX_SIZE + 10),
        })}`.slice(0, NETWORK_BODY_MAX_SIZE),
        { warnings: ['MAYBE_JSON_TRUNCATED'] },
      ],
    ])('works with %s', (label, input, expectedBody, expectedMeta) => {
      const actual = buildNetworkRequestOrResponse({}, 1, input);

      expect(actual).toEqual({ size: 1, headers: {}, body: expectedBody, _meta: expectedMeta });
    });
  });

  describe('getFullUrl', () => {
    it.each([
      ['http://example.com', 'http://example.com', 'http://example.com'],
      ['https://example.com', 'https://example.com', 'https://example.com'],
      ['//example.com', 'https://example.com', 'https://example.com'],
      ['//example.com', 'http://example.com', 'http://example.com'],
      ['//example.com/', 'http://example.com', 'http://example.com/'],
      ['//example.com/sub/aha.html', 'http://example.com', 'http://example.com/sub/aha.html'],
      ['https://example.com/sub/aha.html', 'http://example.com', 'https://example.com/sub/aha.html'],
      ['sub/aha.html', 'http://example.com', 'http://example.com/sub/aha.html'],
      ['sub/aha.html', 'http://example.com/initial', 'http://example.com/sub/aha.html'],
      ['sub/aha', 'http://example.com/initial/', 'http://example.com/initial/sub/aha'],
      ['sub/aha/', 'http://example.com/initial/', 'http://example.com/initial/sub/aha/'],
      ['sub/aha.html', 'http://example.com/initial/', 'http://example.com/initial/sub/aha.html'],
      ['/sub/aha.html', 'http://example.com/initial/', 'http://example.com/sub/aha.html'],
      ['./sub/aha.html', 'http://example.com/initial/', 'http://example.com/initial/sub/aha.html'],
      ['../sub/aha.html', 'http://example.com/initial/', 'http://example.com/sub/aha.html'],
      ['sub/aha.html', 'file:///Users/folder/file.html', 'file:///Users/folder/sub/aha.html'],
      ['ws://example.com/sub/aha.html', 'http://example.com/initial/', 'ws://example.com/sub/aha.html'],
    ])('works with %s & baseURI %s', (url, baseURI, expected) => {
      const actual = getFullUrl(url, baseURI);
      expect(actual).toBe(expected);
    });
  });

  describe('getBodyString', () => {
    it('works with a string', () => {
      const actual = getBodyString('abc');
      expect(actual).toEqual(['abc']);
    });

    it('works with URLSearchParams', () => {
      const body = new URLSearchParams();
      body.append('name', 'Anne');
      body.append('age', '32');
      const actual = getBodyString(body);
      expect(actual).toEqual(['name=Anne&age=32']);
    });

    it('works with FormData', () => {
      const body = new FormData();
      body.append('name', 'Anne');
      body.append('age', '32');
      const actual = getBodyString(body);
      expect(actual).toEqual(['name=Anne&age=32']);
    });

    it('works with empty  data', () => {
      const body = undefined;
      const actual = getBodyString(body);
      expect(actual).toEqual([undefined]);
    });

    it('works with other type of data', () => {
      const body = {};
      const actual = getBodyString(body);
      expect(actual).toEqual([undefined, 'UNPARSEABLE_BODY_TYPE']);
    });
  });
});
