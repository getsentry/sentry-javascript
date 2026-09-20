/**
 * This code was originally copied from the 'cookie` module at v0.5.0 and was simplified for our use case.
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
import { parseCookiePairs } from '../../../src/utils/cookie';

describe('parseCookiePairs(value)', function () {
  it('should parse cookie string to ordered pairs', function () {
    expect(parseCookiePairs('foo=bar')).toEqual([['foo', 'bar']]);
    expect(parseCookiePairs('foo=123')).toEqual([['foo', '123']]);
    expect(parseCookiePairs('foo=bar; baz=raz')).toEqual([
      ['foo', 'bar'],
      ['baz', 'raz'],
    ]);
  });

  it('should ignore OWS', function () {
    expect(parseCookiePairs('FOO    = bar;   baz  =   raz')).toEqual([
      ['FOO', 'bar'],
      ['baz', 'raz'],
    ]);
  });

  it('should parse cookie with empty value', function () {
    expect(parseCookiePairs('foo= ; bar=')).toEqual([
      ['foo', ''],
      ['bar', ''],
    ]);
  });

  it('should URL-decode values', function () {
    expect(parseCookiePairs('foo="bar=123456789&name=Magic+Mouse"')).toEqual([
      ['foo', 'bar=123456789&name=Magic+Mouse'],
    ]);

    expect(parseCookiePairs('email=%20%22%2c%3b%2f')).toEqual([['email', ' ",;/']]);
  });

  it('should return original value on escape error', function () {
    expect(parseCookiePairs('foo=%1;bar=bar')).toEqual([
      ['foo', '%1'],
      ['bar', 'bar'],
    ]);
  });

  it('should keep duplicate cookies as ordered pairs', function () {
    expect(parseCookiePairs('foo=%1;bar=bar;foo=boo')).toEqual([
      ['foo', '%1'],
      ['bar', 'bar'],
      ['foo', 'boo'],
    ]);
  });

  it('should return nameless segments with an empty name', function () {
    expect(parseCookiePairs('foo=bar;fizz  ;  buzz')).toEqual([
      ['foo', 'bar'],
      ['', 'fizz'],
      ['', 'buzz'],
    ]);
    expect(parseCookiePairs('  fizz; foo=  bar')).toEqual([
      ['', 'fizz'],
      ['foo', 'bar'],
    ]);
  });

  it('should split on ";" even without a trailing space', function () {
    expect(parseCookiePairs('foo=bar;baz=raz')).toEqual([
      ['foo', 'bar'],
      ['baz', 'raz'],
    ]);
  });

  it('should skip empty segments', function () {
    expect(parseCookiePairs('foo=bar;;;baz=raz;')).toEqual([
      ['foo', 'bar'],
      ['baz', 'raz'],
    ]);
    expect(parseCookiePairs('')).toEqual([]);
  });

  it('should only split on the first "="', function () {
    expect(parseCookiePairs('data=base64==')).toEqual([['data', 'base64==']]);
  });

  it('should decode a percent-encoded value only once', function () {
    expect(parseCookiePairs('token=%2520')).toEqual([['token', '%20']]);
  });

  it('should accept an array of header values', function () {
    expect(parseCookiePairs(['foo=bar', 'baz=raz'])).toEqual([
      ['foo', 'bar'],
      ['baz', 'raz'],
    ]);
    expect(parseCookiePairs(['foo=bar', '', 'baz=raz'])).toEqual([
      ['foo', 'bar'],
      ['baz', 'raz'],
    ]);
  });

  describe('Set-Cookie mode', function () {
    it('should only parse the first segment of each value', function () {
      expect(parseCookiePairs('sid=1; Max-Age=3600; Path=/', true)).toEqual([['sid', '1']]);
      expect(parseCookiePairs('theme=dark; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.com', true)).toEqual([
        ['theme', 'dark'],
      ]);
    });

    it('should parse one cookie per array value', function () {
      expect(parseCookiePairs(['theme=dark; HttpOnly', 'session=abc123; Secure'], true)).toEqual([
        ['theme', 'dark'],
        ['session', 'abc123'],
      ]);
    });

    it('should return nameless first segments with an empty name', function () {
      expect(parseCookiePairs('auth_required; HttpOnly', true)).toEqual([['', 'auth_required']]);
    });
  });

  describe('Set-Cookie attribute handling', function () {
    it('should drop known Set-Cookie attributes by name', function () {
      expect(parseCookiePairs('sid=1; Max-Age=3600; Path=/')).toEqual([['sid', '1']]);
      expect(parseCookiePairs('theme=dark; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.com')).toEqual([
        ['theme', 'dark'],
      ]);
      expect(parseCookiePairs('a=1; SameSite=Lax; Max-Age=60')).toEqual([['a', '1']]);
    });

    it('should return bare flag attributes as nameless pairs (dropped or filtered downstream)', () => {
      expect(parseCookiePairs('a=1; Secure; HttpOnly')).toEqual([
        ['a', '1'],
        ['', 'Secure'],
        ['', 'HttpOnly'],
      ]);
    });

    it('should match attribute names case-insensitively', function () {
      expect(parseCookiePairs('sid=1; max-age=3600; PATH=/')).toEqual([['sid', '1']]);
    });
  });
});
