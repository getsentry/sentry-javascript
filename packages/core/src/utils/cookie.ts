/**
 * The value decoding in `cookiePairsToRecord` was originally copied from the 'cookie` module at v0.5.0.
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

/** A cookie's name and raw value. A nameless cookie (RFC 6265bis) has the name `''`. */
export type CookiePair = [name: string, value: string];

/**
 * Splits a `Cookie` / `Set-Cookie` header into its ordered name-value pairs. Values stay as they are on the wire.
 *
 * A segment without an `=` is a nameless cookie, so the bare token is its value (RFC 6265bis).
 */
export function parseCookieHeader(value: string | string[], headerName: 'cookie' | 'set-cookie'): CookiePair[] {
  // Set-Cookie: one cookie per value, followed by attributes ("name=value; HttpOnly; Secure")
  // Cookie: multiple cookies separated by ";" (the space after ";" is not guaranteed on the wire)
  const segments = (Array.isArray(value) ? value : [value]).flatMap(headerValue => {
    if (typeof headerValue !== 'string') {
      return [];
    }
    return headerName === 'set-cookie' ? [headerValue.split(';')[0]!] : headerValue.split(';');
  });

  return (
    segments
      .map(segment => segment.trim())
      // ";;" and trailing ";" leave empty segments
      .filter(segment => segment !== '')
      .map(segment => {
        // Only first "=" separates name from value: "jwt=eyJhbGc=" has value "eyJhbGc="
        const equalSignIndex = segment.indexOf('=');
        return equalSignIndex === -1
          ? // No "=": nameless cookie, the whole segment is the value
            ['', segment]
          : // Trim both parts, so that "theme = dark" is named "theme", not "theme "
            [segment.slice(0, equalSignIndex).trim(), segment.slice(equalSignIndex + 1).trim()];
      })
  );
}

/**
 * Converts cookie pairs to a record with decoded values. The first cookie of a name wins.
 *
 * Nameless cookies are dropped: their token is the value, and a record key cannot mark it as filtered.
 */
export function cookiePairsToRecord(pairs: CookiePair[]): Record<string, string> {
  const record: Record<string, string> = {};

  for (const [name, value] of pairs) {
    if (name !== '' && record[name] === undefined) {
      record[name] = decodeCookieValue(value);
    }
  }

  return record;
}

function decodeCookieValue(value: string): string {
  const unquoted = value.charCodeAt(0) === 0x22 ? value.slice(1, -1) : value;

  try {
    return unquoted.indexOf('%') !== -1 ? decodeURIComponent(unquoted) : unquoted;
  } catch {
    return unquoted;
  }
}
