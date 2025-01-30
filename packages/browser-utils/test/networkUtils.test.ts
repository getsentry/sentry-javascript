/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { getBodyString, getFetchRequestArgBody, serializeFormData } from '../src/networkUtils';

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

describe('getFetchRequestArgBody', () => {
  describe('valid types of body', () => {
    it('works with json string', () => {
      const body = { data: [1, 2, 3] };
      const jsonBody = JSON.stringify(body);

      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body: jsonBody }]);
      expect(actual).toEqual(jsonBody);
    });

    it('works with URLSearchParams', () => {
      const body = new URLSearchParams();
      body.append('name', 'Anne');
      body.append('age', '32');

      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body }]);
      expect(actual).toEqual(body);
    });

    it('works with FormData', () => {
      const body = new FormData();
      body.append('name', 'Bob');
      body.append('age', '32');

      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body }]);
      expect(actual).toEqual(body);
    });

    it('works with Blob', () => {
      const body = new Blob(['example'], { type: 'text/plain' });
      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body }]);
      expect(actual).toEqual(body);
    });

    it('works with BufferSource (ArrayBufferView | ArrayBuffer)', () => {
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

describe('serializeFormData', () => {
  it('works with FormData', () => {
    const formData = new FormData();
    formData.append('name', 'Anne Smith');
    formData.append('age', '13');

    const actual = serializeFormData(formData);
    expect(actual).toBe('name=Anne+Smith&age=13');
  });
});
