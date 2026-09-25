import { describe, expect, it } from 'vitest';
import { filterCollectedHttpBody } from '../../../../src/utils/data-collection/filterHttpBody';

describe('filterCollectedHttpBody', () => {
  it('passes through nullish and empty bodies untouched', () => {
    expect(filterCollectedHttpBody(undefined)).toBeUndefined();
    expect(filterCollectedHttpBody(null)).toBeNull();
    expect(filterCollectedHttpBody('')).toBe('');
  });

  describe('already parsed bodies', () => {
    it('filters values for sensitive keys and keeps the rest', () => {
      expect(filterCollectedHttpBody({ email: 'a@b.c', password: 'supersecret123' })).toEqual({
        email: 'a@b.c',
        password: '[Filtered]',
      });
    });

    it('filters nested objects and arrays', () => {
      expect(filterCollectedHttpBody({ users: [{ name: 'jane', api_key: 'abc' }] })).toEqual({
        users: [{ name: 'jane', api_key: '[Filtered]' }],
      });
    });
  });

  describe('JSON string bodies', () => {
    it('filters sensitive keys and keeps the string shape', () => {
      expect(filterCollectedHttpBody('{"colour":"blue","token":"abc"}')).toBe('{"colour":"blue","token":"[Filtered]"}');
    });

    it('filters sensitive keys inside arrays of objects', () => {
      expect(filterCollectedHttpBody('[{"colour":"blue","token":"abc"}]')).toBe(
        '[{"colour":"blue","token":"[Filtered]"}]',
      );
    });

    it('passes through a bare JSON scalar, which has no keys to scrub by', () => {
      expect(filterCollectedHttpBody('"just a string"')).toBe('"just a string"');
      expect(filterCollectedHttpBody('42')).toBe('42');
    });
  });

  describe('form-encoded string bodies', () => {
    it('filters sensitive keys while preserving the original encoding', () => {
      expect(filterCollectedHttpBody('colour=blue&user%5Bpassword%5D=supersecret123')).toBe(
        'colour=blue&user%5Bpassword%5D=[Filtered]',
      );
    });

    it('keeps a single-field form', () => {
      expect(filterCollectedHttpBody('flag=on')).toBe('flag=on');
    });

    it('filters forms with a trailing ampersand, valueless keys, or empty segments', () => {
      expect(filterCollectedHttpBody('password=secret&')).toBe('password=[Filtered]&');
      expect(filterCollectedHttpBody('token=abc&flag')).toBe('token=[Filtered]&flag');
      expect(filterCollectedHttpBody('colour=blue&&password=x')).toBe('colour=blue&&password=[Filtered]');
    });
  });

  describe('bodies without key-value structure', () => {
    // Server-side scrubbing handles these: the SDK cannot attribute any part of them to a specific, sensitive key
    it.each([
      ['<xml><secret>value</secret></xml>'],
      ['plain text body'],
      ['query Test { people { name } }'],
      ['c2VjcmV0LXRva2VuLTEyMw=='],
      // These contain a `=` but are not forms; the filter must not rewrite them as one.
      ['<login password="hunter2" />'],
      ['--boundary\r\nContent-Disposition: form-data; name="password"\r\n\r\nhunter2\r\n--boundary--'],
      ['https://example.com/callback?code=abc123'],
      ['total = 42'],
    ])('passes through %s unchanged', body => {
      expect(filterCollectedHttpBody(body)).toBe(body);
    });

    it('passes through non-string, non-object bodies unchanged', () => {
      const buffer = Buffer.from('raw bytes');
      expect(filterCollectedHttpBody(42)).toBe(42);
      expect(filterCollectedHttpBody(buffer)).toBe(buffer);
    });
  });
});
