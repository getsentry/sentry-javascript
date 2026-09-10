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

    it('filters a bare JSON scalar, which has no keys to match against', () => {
      expect(filterCollectedHttpBody('"just a string"')).toBe('[Filtered]');
      expect(filterCollectedHttpBody('42')).toBe('[Filtered]');
    });
  });

  describe('form-encoded string bodies', () => {
    it('filters sensitive keys while preserving the original encoding', () => {
      expect(filterCollectedHttpBody('colour=blue&user%5Bpassword%5D=supersecret123')).toBe(
        'colour=blue&user%5Bpassword%5D=[Filtered]',
      );
    });
  });

  describe('unparseable bodies', () => {
    it.each([['<xml><secret>value</secret></xml>'], ['plain text body'], ['query Test { people { name } }']])(
      'replaces %s with the filtered value',
      body => {
        expect(filterCollectedHttpBody(body)).toBe('[Filtered]');
      },
    );

    it('replaces bodies that are not a key-value structure', () => {
      expect(filterCollectedHttpBody(42)).toBe('[Filtered]');
      expect(filterCollectedHttpBody(Buffer.from('raw bytes'))).toBe('[Filtered]');
    });
  });
});
