import { describe, expect, it } from 'vitest';
import { filterQueryParams } from '../../../../src/utils/data-collection/filterQueryParams';

describe('filterQueryParams', () => {
  describe('off mode (false)', () => {
    it('returns empty record', () => {
      expect(filterQueryParams('page=1&token=abc', false)).toEqual({});
    });
  });

  describe('denyList mode (true)', () => {
    it('filters sensitive param names and preserves safe ones', () => {
      const result = filterQueryParams('page=1&api_key=secret&sort=name', true);

      expect(result).toEqual({
        page: '1',
        api_key: '[Filtered]', // matches "key"
        sort: 'name',
      });
    });

    it('filters auth-related params', () => {
      const result = filterQueryParams('auth=abc&redirect=/home', true);

      expect(result).toEqual({
        auth: '[Filtered]', // matches "auth"
        redirect: '/home',
      });
    });
  });

  describe('denyList mode ({ deny: [...] })', () => {
    it('applies extra deny terms on top of built-in denylist', () => {
      const result = filterQueryParams('page=1&utm_source=email', { deny: ['utm'] });

      expect(result).toEqual({
        page: '1',
        utm_source: '[Filtered]',
      });
    });
  });

  describe('allowList mode ({ allow: [...] })', () => {
    it('only allows specified param names to pass through', () => {
      const result = filterQueryParams('page=1&token=abc&sort=name', {
        allow: ['page', 'sort'],
      });

      expect(result).toEqual({
        page: '1',
        token: '[Filtered]', // sensitive denylist
        sort: 'name',
      });
    });

    it('sensitive denylist overrides allowlist', () => {
      const result = filterQueryParams('token=secret', { allow: ['token'] });

      expect(result).toEqual({
        token: '[Filtered]', // "token" matches sensitive denylist
      });
    });
  });

  describe('unparseable input', () => {
    it('returns [Filtered] for empty string', () => {
      expect(filterQueryParams('', true)).toBe('[Filtered]');
    });
  });

  describe('edge cases', () => {
    it('handles URL-encoded values', () => {
      const result = filterQueryParams('name=hello%20world&page=1', true);

      expect(result).toEqual({
        name: 'hello world',
        page: '1',
      });
    });

    it('handles params with no value', () => {
      const result = filterQueryParams('debug&page=1', true);

      expect(result).toEqual({
        debug: '',
        page: '1',
      });
    });

    it('handles duplicate params (last value wins via URLSearchParams)', () => {
      const result = filterQueryParams('page=1&page=2', true);

      expect(result).toEqual({
        page: '2',
      });
    });
  });
});
