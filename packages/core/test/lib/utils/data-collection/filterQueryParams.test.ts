import { describe, expect, it } from 'vitest';
import { filterQueryParams } from '../../../../src/utils/data-collection/filterQueryParams';

describe('filterQueryParams', () => {
  describe('off mode (false)', () => {
    it('returns undefined', () => {
      expect(filterQueryParams('page=1&token=abc', false)).toBeUndefined();
    });
  });

  describe('denyList mode (true)', () => {
    it('filters sensitive param names and preserves safe ones', () => {
      const result = filterQueryParams('page=1&api_key=secret&sort=name', true);

      expect(result).toBe('page=1&api_key=[Filtered]&sort=name');
    });

    it('filters auth-related params', () => {
      const result = filterQueryParams('auth=abc&redirect=/home', true);

      expect(result).toBe('auth=[Filtered]&redirect=/home');
    });
  });

  describe('denyList mode ({ deny: [...] })', () => {
    it('applies extra deny terms on top of built-in denylist', () => {
      const result = filterQueryParams('page=1&utm_source=email', { deny: ['utm'] });

      expect(result).toBe('page=1&utm_source=[Filtered]');
    });
  });

  describe('allowList mode ({ allow: [...] })', () => {
    it('only allows specified param names to pass through', () => {
      const result = filterQueryParams('page=1&token=abc&sort=name', {
        allow: ['page', 'sort'],
      });

      expect(result).toBe('page=1&token=[Filtered]&sort=name');
    });

    it('sensitive denylist overrides allowlist', () => {
      const result = filterQueryParams('token=secret', { allow: ['token'] });

      // "token" matches sensitive denylist
      expect(result).toBe('token=[Filtered]');
    });
  });

  describe('empty input', () => {
    it('returns undefined for empty string', () => {
      expect(filterQueryParams('', true)).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('preserves URL-encoded values', () => {
      const result = filterQueryParams('name=hello%20world&page=1', true);

      expect(result).toBe('name=hello%20world&page=1');
    });

    it('preserves plus-encoded spaces', () => {
      const result = filterQueryParams('name=hello+world&page=1', true);

      expect(result).toBe('name=hello+world&page=1');
    });

    it('filters URL-encoded sensitive param names', () => {
      const result = filterQueryParams('to%6Ben=secret&page=1', true);

      expect(result).toBe('to%6Ben=[Filtered]&page=1');
    });

    it('filters empty param names in allowlist mode', () => {
      const result = filterQueryParams('=secret&page=1', { allow: ['page'] });

      expect(result).toBe('=[Filtered]&page=1');
    });

    it('preserves empty param names in denylist mode', () => {
      const result = filterQueryParams('=secret&page=1', { deny: [] });

      expect(result).toBe('=secret&page=1');
    });

    it('preserves params with no value', () => {
      const result = filterQueryParams('debug&page=1', true);

      expect(result).toBe('debug&page=1');
    });

    it('filters sensitive params with no value', () => {
      const result = filterQueryParams('debug&token&page=1', true);

      expect(result).toBe('debug&token=[Filtered]&page=1');
    });

    it('preserves duplicate params and their order', () => {
      const result = filterQueryParams('page=1&page=2&token=first&token=second', true);

      expect(result).toBe('page=1&page=2&token=[Filtered]&token=[Filtered]');
    });

    it('preserves encoded delimiters in values', () => {
      const result = filterQueryParams('redirect=%2Fhome%3Ftab%3Done%26sort%3Dasc&token=a%26b', true);

      expect(result).toBe('redirect=%2Fhome%3Ftab%3Done%26sort%3Dasc&token=[Filtered]');
    });
  });
});
