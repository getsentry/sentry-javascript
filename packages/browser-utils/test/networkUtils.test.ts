/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { getBodyString, getFetchRequestArgBody } from '../src/networkUtils';

describe('getBodyString', () => {
  it('should work with a string', () => {
    const actual = getBodyString('abc');
    expect(actual).toEqual(['abc']);
  });

  it('should work with URLSearchParams', () => {
    const body = new URLSearchParams();
    body.append('name', 'Anne');
    body.append('age', '32');
    const actual = getBodyString(body);
    expect(actual).toEqual(['name=Anne&age=32']);
  });

  it('should work with FormData', () => {
    const body = new FormData();
    body.append('name', 'Bob');
    body.append('age', '32');
    const actual = getBodyString(body);
    expect(actual).toEqual(['name=Bob&age=32']);
  });

  it('should work with empty data', () => {
    const body = undefined;
    const actual = getBodyString(body);
    expect(actual).toEqual([undefined]);
  });

  it('should return unparsable with other types of data', () => {
    const body = {};
    const actual = getBodyString(body);
    expect(actual).toEqual([undefined, 'UNPARSEABLE_BODY_TYPE']);
  });
});

describe('getFetchRequestArgBody', () => {
  describe('valid types of body', () => {
    it('should work with json string', () => {
      const body = { data: [1, 2, 3] };
      const jsonBody = JSON.stringify(body);

      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body: jsonBody }]);
      expect(actual).toEqual(jsonBody);
    });

    it('should work with URLSearchParams', () => {
      const body = new URLSearchParams();
      body.append('name', 'Anne');
      body.append('age', '32');

      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body }]);
      expect(actual).toEqual(body);
    });

    it('should work with FormData', () => {
      const body = new FormData();
      body.append('name', 'Bob');
      body.append('age', '32');

      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body }]);
      expect(actual).toEqual(body);
    });

    it('should work with Blob', () => {
      const body = new Blob(['example'], { type: 'text/plain' });
      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body }]);
      expect(actual).toEqual(body);
    });

    it('should work with BufferSource (ArrayBufferView | ArrayBuffer)', () => {
      const body = new Uint8Array([1, 2, 3]);
      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body }]);
      expect(actual).toEqual(body);
    });
  });

  describe('does not work without body passed as the second option', () => {
    it.each([
      ['string URL only', ['http://example.com']],
      ['URL object only', [new URL('http://example.com')]],
      ['Request URL only', [{ url: 'http://example.com' }]],
      ['body in first arg', [{ url: 'http://example.com', method: 'POST', body: JSON.stringify({ data: [1, 2, 3] }) }]],
    ])('%s', (_name, args) => {
      const actual = getFetchRequestArgBody(args);

      expect(actual).toBeUndefined();
    });
  });
});
