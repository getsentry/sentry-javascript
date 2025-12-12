import { describe, expect, it } from 'vitest';
import {
  extractQueryParamsFromUrl,
  headersToDict,
  httpHeadersToSpanAttributes,
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

  describe('httpHeadersToSpanAttributes', () => {
    it('works with empty headers object', () => {
      expect(httpHeadersToSpanAttributes({})).toEqual({});
    });

    it('converts single string header values to strings', () => {
      const headers = {
        'Content-Type': 'application/json',
        'user-agent': 'test-agent',
      };

      const result = httpHeadersToSpanAttributes(headers);

      expect(result).toEqual({
        'http.request.header.content_type': 'application/json',
        'http.request.header.user_agent': 'test-agent',
      });
    });

    it('handles array header values by joining with semicolons', () => {
      const headers = {
        'custom-header': ['value1', 'value2'],
        accept: ['application/json', 'text/html'],
      };

      const result = httpHeadersToSpanAttributes(headers);

      expect(result).toEqual({
        'http.request.header.custom_header': 'value1;value2',
        'http.request.header.accept': 'application/json;text/html',
      });
    });

    it('filters undefined values in arrays when joining', () => {
      const headers = {
        'undefined-values': [undefined, undefined],
        'valid-header': 'valid-value',
      } as any;

      const result = httpHeadersToSpanAttributes(headers);

      expect(result).toEqual({
        'http.request.header.valid_header': 'valid-value',
        'http.request.header.undefined_values': ';',
      });
    });

    it('ignores undefined header values', () => {
      const headers = {
        'valid-header': 'valid-value',
        'undefined-header': undefined,
      };

      const result = httpHeadersToSpanAttributes(headers);

      expect(result).toEqual({
        'http.request.header.valid_header': 'valid-value',
      });
    });

    it('adds empty array headers as empty string', () => {
      const headers = {
        'empty-header': [],
        'valid-header': 'valid-value',
      } as any;

      const result = httpHeadersToSpanAttributes(headers);

      expect(result).toEqual({
        'http.request.header.empty_header': '',
        'http.request.header.valid_header': 'valid-value',
      });
    });

    it('converts header names to lowercase and replaces dashes with underscores', () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-CUSTOM-HEADER': 'custom-value',
        'user-Agent': 'test-agent',
        ACCEPT: 'text/html',
      };

      const result = httpHeadersToSpanAttributes(headers);

      expect(result).toEqual({
        'http.request.header.content_type': 'application/json',
        'http.request.header.x_custom_header': 'custom-value',
        'http.request.header.user_agent': 'test-agent',
        'http.request.header.accept': 'text/html',
      });
    });

    it('handles real-world headers', () => {
      const headers = {
        Host: 'example.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'X-Forwarded-For': '192.168.1.1',
      };

      const result = httpHeadersToSpanAttributes(headers, true);

      expect(result).toEqual({
        'http.request.header.host': 'example.com',
        'http.request.header.user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'http.request.header.accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'http.request.header.accept_language': 'en-US,en;q=0.5',
        'http.request.header.accept_encoding': 'gzip, deflate',
        'http.request.header.connection': 'keep-alive',
        'http.request.header.upgrade_insecure_requests': '1',
        'http.request.header.cache_control': 'no-cache',
        'http.request.header.x_forwarded_for': '192.168.1.1',
      });
    });

    it('handles multiple values for the same header by joining with semicolons', () => {
      const headers = {
        'x-random-header': ['test=abc123', 'preferences=dark-mode', 'number=three'],
        Accept: ['application/json', 'text/html'],
      };

      const result = httpHeadersToSpanAttributes(headers);

      expect(result).toEqual({
        'http.request.header.x_random_header': 'test=abc123;preferences=dark-mode;number=three',
        'http.request.header.accept': 'application/json;text/html',
      });
    });

    it('handles headers with empty string values', () => {
      const headers = {
        'empty-header': '',
        'valid-header': 'valid-value',
      };

      const result = httpHeadersToSpanAttributes(headers);

      expect(result).toEqual({
        'http.request.header.empty_header': '',
        'http.request.header.valid_header': 'valid-value',
      });
    });

    it('returns empty object when processing invalid headers throws error', () => {
      // Create a headers object that will throw an error when iterated
      const headers = {};
      Object.defineProperty(headers, Symbol.iterator, {
        get() {
          throw new Error('Test error');
        },
      });

      const result = httpHeadersToSpanAttributes(headers);

      expect(result).toEqual({});
    });

    it('stringifies non-string values (except null) in arrays and joins them', () => {
      const headers = {
        'mixed-types': ['string-value', 123, true, null],
      } as any;

      const result = httpHeadersToSpanAttributes(headers);

      expect(result).toEqual({
        'http.request.header.mixed_types': 'string-value;123;true;',
      });
    });

    it('ignores non-string and non-array header values', () => {
      const headers = {
        'string-header': 'valid-value',
        'number-header': 123,
        'boolean-header': true,
        'null-header': null,
        'object-header': { key: 'value' },
      } as any;

      const result = httpHeadersToSpanAttributes(headers);

      expect(result).toEqual({
        'http.request.header.string_header': 'valid-value',
      });
    });

    describe('PII/Sensitive data filtering', () => {
      it('filters sensitive headers case-insensitively', () => {
        const headers = {
          AUTHORIZATION: 'Bearer secret-token',
          Cookie: 'session=abc123',
          'x-aPi-kEy': 'key-123',
          'Content-Type': 'application/json',
        };

        const result = httpHeadersToSpanAttributes(headers);

        expect(result).toEqual({
          'http.request.header.content_type': 'application/json',
          'http.request.header.cookie.session': '[Filtered]',
          'http.request.header.x_api_key': '[Filtered]',
          'http.request.header.authorization': '[Filtered]',
        });
      });

      it('attaches and filters sensitive cookie headers', () => {
        const headers = {
          Cookie:
            'session=abc123; tracking=enabled; cookie-authentication-key-without-value; theme=dark; lang=en; user_session=xyz789; pref=1',
        };

        const result = httpHeadersToSpanAttributes(headers);

        expect(result).toEqual({
          'http.request.header.cookie.session': '[Filtered]',
          'http.request.header.cookie.tracking': 'enabled',
          'http.request.header.cookie.theme': 'dark',
          'http.request.header.cookie.lang': 'en',
          'http.request.header.cookie.user_session': '[Filtered]',
          'http.request.header.cookie.cookie_authentication_key_without_value': '[Filtered]',
          'http.request.header.cookie.pref': '1',
        });
      });

      it('adds a filtered cookie header when cookie header is present, but has no valid key=value pairs', () => {
        const headers1 = { Cookie: ['key', 'val'] };
        const result1 = httpHeadersToSpanAttributes(headers1);
        expect(result1).toEqual({ 'http.request.header.cookie': '[Filtered]' });

        const headers3 = { Cookie: '' };
        const result3 = httpHeadersToSpanAttributes(headers3);
        expect(result3).toEqual({ 'http.request.header.cookie': '[Filtered]' });
      });

      it.each([
        ['preferred-color-mode=light', { 'http.request.header.set_cookie.preferred_color_mode': 'light' }],
        ['theme=dark; HttpOnly', { 'http.request.header.set_cookie.theme': 'dark' }],
        ['session=abc123; Domain=example.com; HttpOnly', { 'http.request.header.set_cookie.session': '[Filtered]' }],
        ['lang=en; Expires=Wed, 21 Oct 2025 07:28:00 GMT', { 'http.request.header.set_cookie.lang': 'en' }],
        ['pref=1; Max-Age=3600', { 'http.request.header.set_cookie.pref': '1' }],
        ['color=blue; Path=/dashboard', { 'http.request.header.set_cookie.color': 'blue' }],
        ['token=eyJhbGc=.eyJzdWI=.SflKxw; Secure', { 'http.request.header.set_cookie.token': '[Filtered]' }],
        ['auth_required; HttpOnly', { 'http.request.header.set_cookie.auth_required': '[Filtered]' }],
        ['empty=; Secure', { 'http.request.header.set_cookie.empty': '' }],
      ])('should parse and filter Set-Cookie header: %s', (setCookieValue, expected) => {
        const headers = { 'Set-Cookie': setCookieValue };
        const result = httpHeadersToSpanAttributes(headers);
        expect(result).toEqual(expected);
      });

      it('only splits cookies once between key and value, even when more equals signs are present', () => {
        const headers = { Cookie: 'random-string=eyJhbGc=.eyJzdWI=.SflKxw' };
        const result = httpHeadersToSpanAttributes(headers);
        expect(result).toEqual({ 'http.request.header.cookie.random_string': 'eyJhbGc=.eyJzdWI=.SflKxw' });
      });

      it.each([
        { sendDefaultPii: false, description: 'sendDefaultPii is false (default)' },
        { sendDefaultPii: true, description: 'sendDefaultPii is true' },
      ])('does not include PII headers when $description', ({ sendDefaultPii }) => {
        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
          'x-user': 'my-personal-username',
          'X-Forwarded-For': '192.168.1.1',
          'X-Forwarded-Host': 'example.com',
          'X-Forwarded-Proto': 'https',
        };

        const result = httpHeadersToSpanAttributes(headers, sendDefaultPii);

        if (sendDefaultPii) {
          expect(result).toEqual({
            'http.request.header.content_type': 'application/json',
            'http.request.header.user_agent': 'Mozilla/5.0',
            'http.request.header.x_user': 'my-personal-username',
            'http.request.header.x_forwarded_for': '192.168.1.1',
            'http.request.header.x_forwarded_host': 'example.com',
            'http.request.header.x_forwarded_proto': 'https',
          });
        } else {
          expect(result).toEqual({
            'http.request.header.content_type': 'application/json',
            'http.request.header.user_agent': 'Mozilla/5.0',
            'http.request.header.x_user': '[Filtered]',
            'http.request.header.x_forwarded_for': '[Filtered]',
            'http.request.header.x_forwarded_host': '[Filtered]',
            'http.request.header.x_forwarded_proto': '[Filtered]',
          });
        }
      });

      it('always filters comprehensive list of sensitive headers', () => {
        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': 'test-agent',
          Accept: 'application/json',
          Host: 'example.com',

          // Should be filtered
          Authorization: 'Bearer token',
          Cookie: 'session=123',
          'Set-Cookie': 'session=456',
          'X-API-Key': 'key',
          'X-Auth-Token': 'token',
          'X-Secret': 'secret',
          'x-secret-key': 'another-secret',
          'WWW-Authenticate': 'Basic',
          'Proxy-Authorization': 'Basic auth',
          'X-Access-Token': 'access',
          'X-CSRF': 'csrf',
          'X-XSRF': 'xsrf',
          'X-Session-Token': 'session',
          'X-Password': 'password',
          'X-Private-Key': 'private',
          'X-Forwarded-user': 'user',
          'X-Forwarded-authorization': 'auth',
          'x-jwt-token': 'jwt',
          'x-bearer-token': 'bearer',
          'x-sso-token': 'sso',
          'x-saml-token': 'saml',
        };

        const result = httpHeadersToSpanAttributes(headers);

        // Sensitive headers are always included and redacted
        expect(result).toEqual({
          'http.request.header.content_type': 'application/json',
          'http.request.header.user_agent': 'test-agent',
          'http.request.header.accept': 'application/json',
          'http.request.header.host': 'example.com',
          'http.request.header.authorization': '[Filtered]',
          'http.request.header.cookie.session': '[Filtered]',
          'http.request.header.set_cookie.session': '[Filtered]',
          'http.request.header.x_api_key': '[Filtered]',
          'http.request.header.x_auth_token': '[Filtered]',
          'http.request.header.x_secret': '[Filtered]',
          'http.request.header.x_secret_key': '[Filtered]',
          'http.request.header.www_authenticate': '[Filtered]',
          'http.request.header.proxy_authorization': '[Filtered]',
          'http.request.header.x_access_token': '[Filtered]',
          'http.request.header.x_csrf': '[Filtered]',
          'http.request.header.x_xsrf': '[Filtered]',
          'http.request.header.x_session_token': '[Filtered]',
          'http.request.header.x_password': '[Filtered]',
          'http.request.header.x_private_key': '[Filtered]',
          'http.request.header.x_forwarded_user': '[Filtered]',
          'http.request.header.x_forwarded_authorization': '[Filtered]',
          'http.request.header.x_jwt_token': '[Filtered]',
          'http.request.header.x_bearer_token': '[Filtered]',
          'http.request.header.x_sso_token': '[Filtered]',
          'http.request.header.x_saml_token': '[Filtered]',
        });
      });
    });
  });
});
