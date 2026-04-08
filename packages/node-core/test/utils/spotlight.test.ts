import { afterEach, describe, expect, it } from 'vitest';
import { getSpotlightConfig } from '../../src/utils/spotlight';

describe('getSpotlightConfig', () => {
  const originalEnv = process.env.SENTRY_SPOTLIGHT;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SENTRY_SPOTLIGHT;
    } else {
      process.env.SENTRY_SPOTLIGHT = originalEnv;
    }
  });

  describe('when options.spotlight is false', () => {
    it('returns false regardless of env var', () => {
      process.env.SENTRY_SPOTLIGHT = 'true';
      expect(getSpotlightConfig(false)).toBe(false);
    });
  });

  describe('when options.spotlight is a string', () => {
    it('returns the string regardless of env var', () => {
      process.env.SENTRY_SPOTLIGHT = 'http://env-url:8080';
      expect(getSpotlightConfig('http://custom:9000')).toBe('http://custom:9000');
    });
  });

  describe('when options.spotlight is true', () => {
    it('returns true when env var is not set', () => {
      delete process.env.SENTRY_SPOTLIGHT;
      expect(getSpotlightConfig(true)).toBe(true);
    });

    it('returns true when env var is a boolean string', () => {
      process.env.SENTRY_SPOTLIGHT = 'true';
      expect(getSpotlightConfig(true)).toBe(true);
    });

    it('returns the env URL when env var is a custom URL', () => {
      process.env.SENTRY_SPOTLIGHT = 'http://localhost:8080';
      expect(getSpotlightConfig(true)).toBe('http://localhost:8080');
    });
  });

  describe('when options.spotlight is undefined', () => {
    it('returns undefined when env var is not set', () => {
      delete process.env.SENTRY_SPOTLIGHT;
      expect(getSpotlightConfig(undefined)).toBeUndefined();
    });

    it('returns true when env var is "true"', () => {
      process.env.SENTRY_SPOTLIGHT = 'true';
      expect(getSpotlightConfig(undefined)).toBe(true);
    });

    it('returns false when env var is "false"', () => {
      process.env.SENTRY_SPOTLIGHT = 'false';
      expect(getSpotlightConfig(undefined)).toBe(false);
    });

    it('returns the env URL when env var is a custom URL', () => {
      process.env.SENTRY_SPOTLIGHT = 'http://localhost:8080';
      expect(getSpotlightConfig(undefined)).toBe('http://localhost:8080');
    });
  });
});
