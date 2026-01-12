import { describe, expect, it } from 'vitest';
import { resolveSpotlightOptions } from '../../src/utils/resolveSpotlightOptions';

describe('resolveSpotlightOptions', () => {
  it('returns false when options.spotlight === false, regardless of env', () => {
    expect(resolveSpotlightOptions(false, undefined)).toBe(false);
    expect(resolveSpotlightOptions(false, true)).toBe(false);
    expect(resolveSpotlightOptions(false, false)).toBe(false);
    expect(resolveSpotlightOptions(false, 'http://localhost:8969')).toBe(false);
  });

  it('returns custom URL when options.spotlight is a string, regardless of env', () => {
    const customUrl = 'http://custom:1234/stream';
    expect(resolveSpotlightOptions(customUrl, undefined)).toBe(customUrl);
    expect(resolveSpotlightOptions(customUrl, true)).toBe(customUrl);
    expect(resolveSpotlightOptions(customUrl, false)).toBe(customUrl);
    expect(resolveSpotlightOptions(customUrl, 'http://other:5678')).toBe(customUrl);
  });

  it('returns env URL when options.spotlight === true and env is a URL', () => {
    const envUrl = 'http://localhost:8969/stream';
    expect(resolveSpotlightOptions(true, envUrl)).toBe(envUrl);
  });

  it('returns true when options.spotlight === true and env is true', () => {
    expect(resolveSpotlightOptions(true, true)).toBe(true);
  });

  it('returns true when options.spotlight === true and env is false', () => {
    expect(resolveSpotlightOptions(true, false)).toBe(true);
  });

  it('returns true when options.spotlight === true and env is undefined', () => {
    expect(resolveSpotlightOptions(true, undefined)).toBe(true);
  });

  it('returns env boolean when options.spotlight === undefined and env is boolean', () => {
    expect(resolveSpotlightOptions(undefined, true)).toBe(true);
    expect(resolveSpotlightOptions(undefined, false)).toBe(false);
  });

  it('returns env URL when options.spotlight === undefined and env is a URL', () => {
    const envUrl = 'http://localhost:8969/stream';
    expect(resolveSpotlightOptions(undefined, envUrl)).toBe(envUrl);
  });

  it('returns undefined when both options.spotlight and env are undefined', () => {
    expect(resolveSpotlightOptions(undefined, undefined)).toBe(undefined);
  });

  it('prioritizes env URL over env boolean when options.spotlight === undefined', () => {
    // This shouldn't happen in practice, but tests the logic path
    // In reality, envSpotlight will be either boolean, string, or undefined
    const envUrl = 'http://localhost:8969/stream';
    expect(resolveSpotlightOptions(undefined, envUrl)).toBe(envUrl);
  });

  describe('empty string handling - NEVER returns empty strings', () => {
    it('returns undefined (never empty string) when options.spotlight is an empty string', () => {
      expect(resolveSpotlightOptions('', undefined)).toBeUndefined();
      expect(resolveSpotlightOptions('', true)).toBeUndefined();
      expect(resolveSpotlightOptions('', 'http://env:8969')).toBeUndefined();
    });

    it('returns undefined (never empty string) when options.spotlight is whitespace only', () => {
      expect(resolveSpotlightOptions('   ', undefined)).toBeUndefined();
      expect(resolveSpotlightOptions('\t\n', true)).toBeUndefined();
    });

    it('returns undefined (never empty string) when env is an empty string and options.spotlight is undefined', () => {
      expect(resolveSpotlightOptions(undefined, '')).toBeUndefined();
    });

    it('returns undefined (never empty string) when env is whitespace only and options.spotlight is undefined', () => {
      expect(resolveSpotlightOptions(undefined, '   ')).toBeUndefined();
      expect(resolveSpotlightOptions(undefined, '\t\n')).toBeUndefined();
    });

    it('returns true when options.spotlight is true and env is empty string (filters out empty env)', () => {
      expect(resolveSpotlightOptions(true, '')).toBe(true);
      expect(resolveSpotlightOptions(true, '   ')).toBe(true);
    });

    it('returns valid URL when options.spotlight is valid URL even if env is empty (filters out empty env)', () => {
      const validUrl = 'http://localhost:8969/stream';
      expect(resolveSpotlightOptions(validUrl, '')).toBe(validUrl);
      expect(resolveSpotlightOptions(validUrl, '   ')).toBe(validUrl);
    });

    it('NEVER returns empty string - comprehensive check of all combinations', () => {
      // Test all possible combinations to ensure empty strings are never returned
      const emptyValues = ['', '   ', '\t\n', '  \t  \n  '];
      const nonEmptyValues = [false, true, undefined, 'http://localhost:8969'];

      // Empty options.spotlight with any env
      for (const emptyOption of emptyValues) {
        for (const env of [...emptyValues, ...nonEmptyValues]) {
          const result = resolveSpotlightOptions(emptyOption, env);
          expect(result).not.toBe('');
          // Only test regex on strings
          if (typeof result === 'string') {
            expect(result).not.toMatch(/^\s+$/);
          }
        }
      }

      // Any options.spotlight with empty env
      for (const option of [...emptyValues, ...nonEmptyValues]) {
        for (const emptyEnv of emptyValues) {
          const result = resolveSpotlightOptions(option, emptyEnv);
          expect(result).not.toBe('');
          // Only test regex on strings
          if (typeof result === 'string') {
            expect(result).not.toMatch(/^\s+$/);
          }
        }
      }
    });
  });
});
