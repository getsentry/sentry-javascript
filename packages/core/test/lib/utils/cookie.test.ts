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
import { parseCookie } from '../../../src/utils/cookie';

describe('parseCookie(str)', function () {
  it('should parse cookie string to object', function () {
    expect(parseCookie('foo=bar')).toEqual({ foo: 'bar' });
    expect(parseCookie('foo=123')).toEqual({ foo: '123' });
  });

  it('should ignore OWS', function () {
    expect(parseCookie('FOO    = bar;   baz  =   raz')).toEqual({ FOO: 'bar', baz: 'raz' });
  });

  it('should parse cookie with empty value', function () {
    expect(parseCookie('foo= ; bar=')).toEqual({ foo: '', bar: '' });
  });

  it('should URL-decode values', function () {
    expect(parseCookie('foo="bar=123456789&name=Magic+Mouse"')).toEqual({ foo: 'bar=123456789&name=Magic+Mouse' });

    expect(parseCookie('email=%20%22%2c%3b%2f')).toEqual({ email: ' ",;/' });
  });

  it('should return original value on escape error', function () {
    expect(parseCookie('foo=%1;bar=bar')).toEqual({ foo: '%1', bar: 'bar' });
  });

  it('should ignore cookies without value', function () {
    expect(parseCookie('foo=bar;fizz  ;  buzz')).toEqual({ foo: 'bar' });
    expect(parseCookie('  fizz; foo=  bar')).toEqual({ foo: 'bar' });
  });

  it('should ignore duplicate cookies', function () {
    expect(parseCookie('foo=%1;bar=bar;foo=boo')).toEqual({ foo: '%1', bar: 'bar' });
    expect(parseCookie('foo=false;bar=bar;foo=tre')).toEqual({ foo: 'false', bar: 'bar' });
    expect(parseCookie('foo=;bar=bar;foo=boo')).toEqual({ foo: '', bar: 'bar' });
  });
});
