import { describe, expect, it } from 'vitest';
import {
  extractQueryParamsFromUrl,
  headersToDict,
  httpRequestToRequestData,
  winterCGHeadersToDict,
  winterCGRequestToRequestData,
} from '../../../src/utils/request';

describe('request utils', () => {
  describe('winterCGHeadersToDict', () => {
    it('works with invalid headers object', () => {
      expect(winterCGHeadersToDict({} as any)).toEqual({});
    });

    it('works with header object', () => {
      expect(
        winterCGHeadersToDict({
          forEach: (callbackfn: (value: unknown, key: string) => void): void => {
            callbackfn('value1', 'key1');
            callbackfn(['value2'], 'key2');
            callbackfn('value3', 'key3');
          },
        } as any),
      ).toEqual({
        key1: 'value1',
        key3: 'value3',
      });
    });
  });

  describe('headersToDict', () => {
    it('works with empty object', () => {
      expect(headersToDict({})).toEqual({});
    });

    it('works with plain object', () => {
      expect(
        headersToDict({
          key1: 'value1',
          key2: ['value2'],
          key3: 'value3',
        }),
      ).toEqual({
        key1: 'value1',
        key3: 'value3',
      });
    });
  });

  describe('winterCGRequestToRequestData', () => {
    it('works', () => {
      const actual = winterCGRequestToRequestData({
        method: 'GET',
        url: 'http://example.com?foo=bar&baz=qux',
        headers: {
          forEach: (callbackfn: (value: unknown, key: string) => void): void => {
            callbackfn('value1', 'key1');
            callbackfn(['value2'], 'key2');
            callbackfn('value3', 'key3');
          },
        } as any,
        clone: () => ({}) as any,
      });

      expect(actual).toEqual({
        headers: {
          key1: 'value1',
          key3: 'value3',
        },
        method: 'GET',
        query_string: 'foo=bar&baz=qux',
        url: 'http://example.com?foo=bar&baz=qux',
      });
    });
  });

  describe('httpRequestToRequestData', () => {
    it('works with minimal request', () => {
      const actual = httpRequestToRequestData({});
      expect(actual).toEqual({
        headers: {},
      });
    });

    it('works with absolute URL request', () => {
      const actual = httpRequestToRequestData({
        method: 'GET',
        url: 'http://example.com/blabla?xx=a&yy=z',
        headers: {
          key1: 'value1',
          key2: ['value2'],
          key3: 'value3',
        },
      });

      expect(actual).toEqual({
        method: 'GET',
        url: 'http://example.com/blabla?xx=a&yy=z',
        headers: {
          key1: 'value1',
          key3: 'value3',
        },
        query_string: 'xx=a&yy=z',
      });
    });

    it('works with relative URL request without host', () => {
      const actual = httpRequestToRequestData({
        method: 'GET',
        url: '/blabla',
        headers: {
          key1: 'value1',
          key2: ['value2'],
          key3: 'value3',
        },
      });

      expect(actual).toEqual({
        method: 'GET',
        headers: {
          key1: 'value1',
          key3: 'value3',
        },
      });
    });

    it('works with relative URL request with host', () => {
      const actual = httpRequestToRequestData({
        url: '/blabla',
        headers: {
          host: 'example.com',
        },
      });

      expect(actual).toEqual({
        url: 'http://example.com/blabla',
        headers: {
          host: 'example.com',
        },
      });
    });

    it('works with relative URL request with host & protocol', () => {
      const actual = httpRequestToRequestData({
        url: '/blabla',
        headers: {
          host: 'example.com',
        },
        protocol: 'https',
      });

      expect(actual).toEqual({
        url: 'https://example.com/blabla',
        headers: {
          host: 'example.com',
        },
      });
    });

    it('works with relative URL request with host & socket', () => {
      const actual = httpRequestToRequestData({
        url: '/blabla',
        headers: {
          host: 'example.com',
        },
        socket: {
          encrypted: true,
        },
      });

      expect(actual).toEqual({
        url: 'https://example.com/blabla',
        headers: {
          host: 'example.com',
        },
      });
    });

    it('extracts non-standard cookies', () => {
      const actual = httpRequestToRequestData({
        cookies: { xx: 'a', yy: 'z' },
      } as any);

      expect(actual).toEqual({
        headers: {},
        cookies: { xx: 'a', yy: 'z' },
      });
    });

    it('extracts non-standard body', () => {
      const actual = httpRequestToRequestData({
        body: { xx: 'a', yy: 'z' },
      } as any);

      expect(actual).toEqual({
        headers: {},
        data: { xx: 'a', yy: 'z' },
      });
    });

    describe('x-forwarded headers support', () => {
      it('should prioritize x-forwarded-proto header over explicit protocol parameter', () => {
        const actual = httpRequestToRequestData({
          url: '/test',
          headers: {
            host: 'example.com',
            'x-forwarded-proto': 'https',
          },
          protocol: 'http',
        });

        expect(actual).toEqual({
          url: 'https://example.com/test',
          headers: {
            host: 'example.com',
            'x-forwarded-proto': 'https',
          },
        });
      });

      it('should prioritize x-forwarded-proto header even when downgrading from https to http', () => {
        const actual = httpRequestToRequestData({
          url: '/test',
          headers: {
            host: 'example.com',
            'x-forwarded-proto': 'http',
          },
          protocol: 'https',
        });

        expect(actual).toEqual({
          url: 'http://example.com/test',
          headers: {
            host: 'example.com',
            'x-forwarded-proto': 'http',
          },
        });
      });

      it('should prioritize x-forwarded-proto header over socket encryption detection', () => {
        const actual = httpRequestToRequestData({
          url: '/test',
          headers: {
            host: 'example.com',
            'x-forwarded-proto': 'https',
          },
          socket: {
            encrypted: false,
          },
        });

        expect(actual).toEqual({
          url: 'https://example.com/test',
          headers: {
            host: 'example.com',
            'x-forwarded-proto': 'https',
          },
        });
      });

      it('should prioritize x-forwarded-host header over standard host header', () => {
        const actual = httpRequestToRequestData({
          url: '/test',
          headers: {
            host: 'localhost:3000',
            'x-forwarded-host': 'example.com',
            'x-forwarded-proto': 'https',
          },
        });

        expect(actual).toEqual({
          url: 'https://example.com/test',
          headers: {
            host: 'localhost:3000',
            'x-forwarded-host': 'example.com',
            'x-forwarded-proto': 'https',
          },
        });
      });

      it('should construct URL correctly when both x-forwarded-proto and x-forwarded-host are present', () => {
        const actual = httpRequestToRequestData({
          method: 'POST',
          url: '/api/test?param=value',
          headers: {
            host: 'localhost:3000',
            'x-forwarded-host': 'api.example.com',
            'x-forwarded-proto': 'https',
            'content-type': 'application/json',
          },
          protocol: 'http',
        });

        expect(actual).toEqual({
          method: 'POST',
          url: 'https://api.example.com/api/test?param=value',
          query_string: 'param=value',
          headers: {
            host: 'localhost:3000',
            'x-forwarded-host': 'api.example.com',
            'x-forwarded-proto': 'https',
            'content-type': 'application/json',
          },
        });
      });

      it('should fall back to standard headers when x-forwarded headers are not present', () => {
        const actual = httpRequestToRequestData({
          url: '/test',
          headers: {
            host: 'example.com',
          },
          protocol: 'https',
        });

        expect(actual).toEqual({
          url: 'https://example.com/test',
          headers: {
            host: 'example.com',
          },
        });
      });

      it('should ignore x-forwarded headers when they contain non-string values', () => {
        const actual = httpRequestToRequestData({
          url: '/test',
          headers: {
            host: 'example.com',
            'x-forwarded-host': ['forwarded.example.com'] as any,
            'x-forwarded-proto': ['https'] as any,
          },
          protocol: 'http',
        });

        expect(actual).toEqual({
          url: 'http://example.com/test',
          headers: {
            host: 'example.com',
          },
        });
      });

      it('should correctly transform localhost request to public URL using x-forwarded headers', () => {
        const actual = httpRequestToRequestData({
          method: 'GET',
          url: '/',
          headers: {
            host: 'localhost:3000',
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'example.com',
          },
        });

        expect(actual).toEqual({
          method: 'GET',
          url: 'https://example.com/',
          headers: {
            host: 'localhost:3000',
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'example.com',
          },
        });
      });

      it('should respect x-forwarded-proto even when it downgrades from encrypted socket', () => {
        const actual = httpRequestToRequestData({
          url: '/test',
          headers: {
            host: 'example.com',
            'x-forwarded-proto': 'http',
          },
          socket: {
            encrypted: true,
          },
        });

        expect(actual).toEqual({
          url: 'http://example.com/test',
          headers: {
            host: 'example.com',
            'x-forwarded-proto': 'http',
          },
        });
      });

      it('should preserve query parameters when constructing URL with x-forwarded headers', () => {
        const actual = httpRequestToRequestData({
          method: 'GET',
          url: '/search?q=test&category=api',
          headers: {
            host: 'localhost:8080',
            'x-forwarded-host': 'search.example.com',
            'x-forwarded-proto': 'https',
          },
        });

        expect(actual).toEqual({
          method: 'GET',
          url: 'https://search.example.com/search?q=test&category=api',
          query_string: 'q=test&category=api',
          headers: {
            host: 'localhost:8080',
            'x-forwarded-host': 'search.example.com',
            'x-forwarded-proto': 'https',
          },
        });
      });
    });
  });

  describe('extractQueryParamsFromUrl', () => {
    it.each([
      ['/', undefined],
      ['http://example.com', undefined],
      ['/sub-path', undefined],
      ['/sub-path?xx=a&yy=z', 'xx=a&yy=z'],
      ['http://example.com/sub-path?xx=a&yy=z', 'xx=a&yy=z'],
    ])('works with %s', (url, expected) => {
      expect(extractQueryParamsFromUrl(url)).toEqual(expected);
    });
  });
});
