import { TextEncoder } from 'util';

import {
  buildNetworkRequestOrResponse,
  getBodySize,
  parseContentLengthHeader,
} from '../../../../src/coreHandlers/util/networkUtils';

jest.useFakeTimers();

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
    const textEncoder = new TextEncoder();

    it('works with empty body', () => {
      expect(getBodySize(undefined, textEncoder)).toBe(undefined);
      expect(getBodySize(null, textEncoder)).toBe(undefined);
      expect(getBodySize('', textEncoder)).toBe(undefined);
    });

    it('works with string body', () => {
      expect(getBodySize('abcd', textEncoder)).toBe(4);
      // Emojis are correctly counted as mutliple characters
      expect(getBodySize('With emoji: 😈', textEncoder)).toBe(16);
    });

    it('works with URLSearchParams', () => {
      const params = new URLSearchParams();
      params.append('name', 'Jane');
      params.append('age', '42');
      params.append('emoji', '😈');

      expect(getBodySize(params, textEncoder)).toBe(35);
    });

    it('works with FormData', () => {
      const formData = new FormData();
      formData.append('name', 'Jane');
      formData.append('age', '42');
      formData.append('emoji', '😈');

      expect(getBodySize(formData, textEncoder)).toBe(35);
    });

    it('works with Blob', () => {
      const blob = new Blob(['<html>Hello world: 😈</html>'], { type: 'text/html' });

      expect(getBodySize(blob, textEncoder)).toBe(30);
    });

    it('works with ArrayBuffer', () => {
      const arrayBuffer = new ArrayBuffer(8);

      expect(getBodySize(arrayBuffer, textEncoder)).toBe(8);
    });
  });

  describe('buildNetworkRequestOrResponse', () => {
    it.each([
      ['empty array', [], [], undefined],
      ['simple array', [1, 'a', true, null, undefined], [1, 'a', true, null, undefined], undefined],
      [
        'nested array',
        [1, [2, [3, [4, [5, [6, [7, [8]]]]]]]],
        [1, [2, [3, [4, [5, [6, '[~MaxDepth]']]]]]],
        { warnings: ['MAX_JSON_DEPTH_EXCEEDED'] },
      ],
      ['empty object', {}, {}, undefined],
      [
        'simple object',
        { a: 1, b: true, c: 'yes', d: null, e: undefined },
        { a: 1, b: true, c: 'yes', d: null, e: undefined },
        undefined,
      ],
      [
        'nested object',
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
                    l: '[~MaxDepth]',
                  },
                },
              },
            },
          },
        },
        { warnings: ['MAX_JSON_DEPTH_EXCEEDED'] },
      ],
      [
        'nested object with array',
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
                  children: ['[~MaxDepth]', '[~MaxDepth]'],
                },
              ],
            },
          },
        },
        { warnings: ['MAX_JSON_DEPTH_EXCEEDED'] },
      ],
    ])('works with %s', (_name, input, expectedBody, expectedMeta) => {
      const actual = buildNetworkRequestOrResponse(1, input);

      expect(actual).toEqual({ size: 1, body: expectedBody, _meta: expectedMeta });
    });
  });
});
