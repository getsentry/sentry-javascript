/**
 * The `cookiePairsToRecord` decoding cases were originally copied from the 'cookie` module at v0.5.0.
 * https://github.com/jshttp/cookie/blob/a0c84147aab6266bdb3996cf4062e93907c0b0fc/test/parse.js
 * It had the following license:
 *
 * (The MIT License)
 *
 * Copyright (c) 2012-2014 Roman Shtylman <shtylman@gmail.com>
 * Copyright (c) 2015 Douglas Christopher Wilson <doug@somethingdoug.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * 'Software'), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { describe, expect, it } from 'vitest';
import { cookiePairsToRecord, parseCookieHeader } from '../../../src/utils/cookie';

describe('parseCookieHeader', () => {
  describe('cookie', () => {
    it('returns the pairs in header order and keeps repeated names', () => {
      expect(parseCookieHeader('locale=en; theme=dark; locale=de', 'cookie')).toEqual([
        ['locale', 'en'],
        ['theme', 'dark'],
        ['locale', 'de'],
      ]);
    });

    it('splits on ";" without a following space', () => {
      expect(parseCookieHeader('theme=dark;__Secure-session=abc123', 'cookie')).toEqual([
        ['theme', 'dark'],
        ['__Secure-session', 'abc123'],
      ]);
    });

    it('trims whitespace around names and values', () => {
      expect(parseCookieHeader('  THEME   = dark ;   locale  =   en', 'cookie')).toEqual([
        ['THEME', 'dark'],
        ['locale', 'en'],
      ]);
    });

    it('splits a pair only at the first "="', () => {
      expect(parseCookieHeader('jwt=eyJhbGc=.eyJzdWI=.SflKxw', 'cookie')).toEqual([
        ['jwt', 'eyJhbGc=.eyJzdWI=.SflKxw'],
      ]);
    });

    it('keeps values as they are on the wire', () => {
      expect(parseCookieHeader('email=jane%40example.com; theme="dark mode"', 'cookie')).toEqual([
        ['email', 'jane%40example.com'],
        ['theme', '"dark mode"'],
      ]);
    });

    it('keeps an empty value', () => {
      expect(parseCookieHeader('cart=; theme= ', 'cookie')).toEqual([
        ['cart', ''],
        ['theme', ''],
      ]);
    });

    it.each([
      ['a segment without "="', 'y7Uu0Rk2QpLmXv3; theme=dark'],
      ['a segment that starts with "="', '=y7Uu0Rk2QpLmXv3; theme=dark'],
    ])('returns %s as a nameless cookie', (_, header) => {
      expect(parseCookieHeader(header, 'cookie')).toEqual([
        ['', 'y7Uu0Rk2QpLmXv3'],
        ['theme', 'dark'],
      ]);
    });

    it.each(['', '   ', ';;;', ' ; ; ', '=', ' = ; ='])('returns no pairs for %j', header => {
      expect(parseCookieHeader(header, 'cookie')).toEqual([]);
    });

    it('does not split a value on ","', () => {
      expect(parseCookieHeader('recent=shoes,socks; theme=dark', 'cookie')).toEqual([
        ['recent', 'shoes,socks'],
        ['theme', 'dark'],
      ]);
    });

    it('reads Set-Cookie attribute names as cookie names', () => {
      expect(parseCookieHeader('Path=/; Max-Age=3600', 'cookie')).toEqual([
        ['Path', '/'],
        ['Max-Age', '3600'],
      ]);
    });
  });

  describe('set-cookie', () => {
    it.each([
      'sid=s3cr3t; Max-Age=3600; Path=/',
      'sid=s3cr3t; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.com',
      'sid=s3cr3t; HttpOnly; Secure; SameSite=Lax',
      'sid=s3cr3t;Secure',
    ])('drops the attributes of %j', header => {
      expect(parseCookieHeader(header, 'set-cookie')).toEqual([['sid', 's3cr3t']]);
    });

    it('returns a nameless cookie when the cookie segment has no "="', () => {
      expect(parseCookieHeader('y7Uu0Rk2QpLmXv3; HttpOnly', 'set-cookie')).toEqual([['', 'y7Uu0Rk2QpLmXv3']]);
    });

    it('returns no pairs when the cookie segment is empty', () => {
      expect(parseCookieHeader('; HttpOnly', 'set-cookie')).toEqual([]);
    });

    it('returns one pair per header value', () => {
      expect(parseCookieHeader(['theme=dark; HttpOnly', 'sid=s3cr3t; Secure'], 'set-cookie')).toEqual([
        ['theme', 'dark'],
        ['sid', 's3cr3t'],
      ]);
    });
  });

  describe('array values', () => {
    it('concatenates the cookies of multiple Cookie header values', () => {
      expect(parseCookieHeader(['theme=dark; locale=en', 'sid=s3cr3t'], 'cookie')).toEqual([
        ['theme', 'dark'],
        ['locale', 'en'],
        ['sid', 's3cr3t'],
      ]);
    });

    it('returns no pairs for an empty array', () => {
      expect(parseCookieHeader([], 'cookie')).toEqual([]);
    });

    it('skips values that are not strings', () => {
      const values = ['theme=dark', undefined, 42] as unknown as string[];

      expect(parseCookieHeader(values, 'cookie')).toEqual([['theme', 'dark']]);
    });
  });
});

describe('cookiePairsToRecord', () => {
  it('returns an empty record for no pairs', () => {
    expect(cookiePairsToRecord([])).toEqual({});
  });

  it('keeps the first value of a repeated name, even when it is empty', () => {
    expect(
      cookiePairsToRecord([
        ['locale', ''],
        ['theme', 'dark'],
        ['locale', 'de'],
      ]),
    ).toEqual({ locale: '', theme: 'dark' });
  });

  it('filters the value of a nameless cookie', () => {
    expect(
      cookiePairsToRecord([
        ['', 'y7Uu0Rk2QpLmXv3'],
        ['theme', 'dark'],
      ]),
    ).toEqual({ '': '[Filtered]', theme: 'dark' });
  });

  it('URL-decodes values', () => {
    expect(cookiePairsToRecord([['email', '%20%22%2c%3b%2f']])).toEqual({ email: ' ",;/' });
  });

  it('keeps a value that is not valid URL encoding', () => {
    expect(cookiePairsToRecord([['discount', '50%']])).toEqual({ discount: '50%' });
  });

  it('strips the quotes of a quoted value', () => {
    expect(cookiePairsToRecord([['cart', '"sku=123456789&name=Magic+Mouse"']])).toEqual({
      cart: 'sku=123456789&name=Magic+Mouse',
    });
  });

  it.each(['"unterminated', 'unstarted"', '"'])('keeps %j, which is not a quoted value', value => {
    expect(cookiePairsToRecord([['note', value]])).toEqual({ note: value });
  });
});
