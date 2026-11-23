import { describe, expect, it } from 'vitest';
import { filterUrlQuery } from '../../../../src/utils/data-collection/filterUrlQuery';

describe('filterUrlQuery', () => {
  describe('no query string', () => {
    it('returns the URL unchanged', () => {
      expect(filterUrlQuery('https://example.com/api/users', true)).toBe('https://example.com/api/users');
    });

    it('returns a URL with only a fragment unchanged', () => {
      expect(filterUrlQuery('https://example.com/docs#section', true)).toBe('https://example.com/docs#section');
    });

    it('leaves a trailing `?` with no params alone', () => {
      expect(filterUrlQuery('https://example.com/api?', true)).toBe('https://example.com/api');
    });
  });

  describe('denyList mode (true)', () => {
    it('filters sensitive params and preserves the rest', () => {
      const result = filterUrlQuery('https://example.com/api/users?token=abc123&q=a%20b%26c&page=5', true);

      expect(result).toBe('https://example.com/api/users?token=[Filtered]&q=a%20b%26c&page=5');
    });

    it('preserves the fragment', () => {
      const result = filterUrlQuery('https://example.com/api?token=abc&page=5#results', true);

      expect(result).toBe('https://example.com/api?token=[Filtered]&page=5#results');
    });

    it('preserves userinfo, port and path', () => {
      const result = filterUrlQuery('https://user:pw@example.com:8443/a/b?secret=x&ok=1', true);

      expect(result).toBe('https://user:pw@example.com:8443/a/b?secret=[Filtered]&ok=1');
    });
  });

  describe('off mode (false)', () => {
    it('removes the query entirely', () => {
      expect(filterUrlQuery('https://example.com/api/users?token=abc&page=5', false)).toBe(
        'https://example.com/api/users',
      );
    });

    it('removes the query and the fragment', () => {
      expect(filterUrlQuery('https://example.com/api?token=abc#results', false)).toBe('https://example.com/api');
    });

    it('removes a fragment without a query', () => {
      expect(filterUrlQuery('https://example.com/callback#access_token=abc123&state=xyz', false)).toBe(
        'https://example.com/callback',
      );
    });
  });

  describe('fragment', () => {
    it('filters sensitive pairs in a login redirect fragment', () => {
      const result = filterUrlQuery('https://example.com/callback#access_token=abc123&state=xyz', true);

      expect(result).toBe('https://example.com/callback#access_token=[Filtered]&state=xyz');
    });

    it('filters pairs after the `?` of a hash route', () => {
      const result = filterUrlQuery('https://example.com/#/callback?token=abc&page=2', true);

      expect(result).toBe('https://example.com/#/callback?token=[Filtered]&page=2');
    });

    it('applies allowList mode to fragment pairs', () => {
      const result = filterUrlQuery('https://example.com/#page=1&ref=x', { allow: ['page'] });

      expect(result).toBe('https://example.com/#page=1&ref=[Filtered]');
    });
  });

  describe('allow / deny behaviors', () => {
    it('supports allowList mode', () => {
      const result = filterUrlQuery('https://example.com/s?page=1&ref=x&sort=name', { allow: ['page', 'sort'] });

      expect(result).toBe('https://example.com/s?page=1&ref=[Filtered]&sort=name');
    });

    it('supports extra deny terms', () => {
      const result = filterUrlQuery('https://example.com/s?page=1&utm_source=email', { deny: ['utm'] });

      expect(result).toBe('https://example.com/s?page=1&utm_source=[Filtered]');
    });
  });

  describe('non-standard URLs', () => {
    it('handles relative URLs', () => {
      expect(filterUrlQuery('/api/users?token=abc&page=5', true)).toBe('/api/users?token=[Filtered]&page=5');
    });

    it('preserves duplicate params and their order', () => {
      const result = filterUrlQuery('https://example.com/s?page=1&token=a&page=2', true);

      expect(result).toBe('https://example.com/s?page=1&token=[Filtered]&page=2');
    });

    it('does not treat a `?` inside a fragment as a query', () => {
      const result = filterUrlQuery('https://example.com/docs?page=1#/route?token=abc', true);

      expect(result).toBe('https://example.com/docs?page=1#/route?token=[Filtered]');
    });
  });
});
