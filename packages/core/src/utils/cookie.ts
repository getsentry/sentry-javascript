/**
 * This code was originally copied from the 'cookie` module at v0.5.0 and was simplified for our use case.
 * https://github.com/jshttp/cookie/blob/a0c84147aab6266bdb3996cf4062e93907c0b0fc/index.js
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

// `Set-Cookie` attributes are metadata, not cookies. Response cookie strings handed to
// the `Cookie`-mode parser may still carry them, so they are dropped by name.
const SET_COOKIE_ATTRIBUTES = new Set([
  'expires',
  'max-age',
  'domain',
  'path',
  'secure',
  'httponly',
  'samesite',
  'partitioned',
]);

/**
 * Parses a `Cookie` or `Set-Cookie` header value into ordered `[name, value]` pairs.
 *
 * In `Set-Cookie` mode each header value carries a single cookie, so only the segment
 * before the first `;` is parsed. Otherwise every `;`-separated segment is a pair, with
 * known `Set-Cookie` attributes dropped by name.
 *
 * Segments without `=` (e.g. a bare token or a flag like `Secure`) are returned as
 * `['', segment]`; values are unquoted and URL-decoded.
 */
export function parseCookiePairs(value: string | string[], setCookie = false): [string, string][] {
  const pairs: [string, string][] = [];

  for (const headerValue of Array.isArray(value) ? value : [value]) {
    if (typeof headerValue !== 'string' || headerValue === '') {
      continue;
    }

    // A `Set-Cookie` value carries one cookie, so only its first segment is a pair.
    // `headerValue` is non-empty here, so the split always yields at least one segment.
    const segments = setCookie ? headerValue.split(';', 1) : headerValue.split(';');

    for (let segment of segments) {
      segment = segment.trim();

      if (segment === '') {
        continue;
      }

      const eqIdx = segment.indexOf('=');
      const name = (eqIdx === -1 ? '' : segment.slice(0, eqIdx)).trim();
      let val = (eqIdx === -1 ? segment : segment.slice(eqIdx + 1)).trim();

      // quoted values
      if (val.charCodeAt(0) === 0x22) {
        val = val.slice(1, -1);
      }

      try {
        val = val.indexOf('%') !== -1 ? decodeURIComponent(val) : val;
      } catch {
        // keep the raw value
      }

      if (!setCookie && SET_COOKIE_ATTRIBUTES.has(name.toLowerCase())) {
        continue;
      }

      pairs.push([name, val]);
    }
  }

  return pairs;
}
