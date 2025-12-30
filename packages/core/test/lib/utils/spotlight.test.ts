import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as debugLogger from '../../../src/utils/debug-logger';
import { parseSpotlightEnvValue, resolveSpotlightValue } from '../../../src/utils/spotlight';

describe('parseSpotlightEnvValue', () => {
  it('returns undefined for undefined input', () => {
    expect(parseSpotlightEnvValue(undefined)).toBe(undefined);
  });

  it('returns undefined for empty string', () => {
    expect(parseSpotlightEnvValue('')).toBe(undefined);
  });

  describe('truthy values', () => {
    it.each(['true', 'True', 'TRUE', 't', 'T', 'y', 'Y', 'yes', 'Yes', 'YES', 'on', 'On', 'ON', '1'])(
      'returns true for "%s"',
      value => {
        expect(parseSpotlightEnvValue(value)).toBe(true);
      },
    );
  });

  describe('falsy values', () => {
    it.each(['false', 'False', 'FALSE', 'f', 'F', 'n', 'N', 'no', 'No', 'NO', 'off', 'Off', 'OFF', '0'])(
      'returns false for "%s"',
      value => {
        expect(parseSpotlightEnvValue(value)).toBe(false);
      },
    );
  });

  describe('URL values', () => {
    it('treats non-boolean strings as URLs', () => {
      expect(parseSpotlightEnvValue('http://localhost:8969/stream')).toBe('http://localhost:8969/stream');
    });

    it('treats arbitrary strings as URLs', () => {
      expect(parseSpotlightEnvValue('some-custom-url')).toBe('some-custom-url');
    });

    it('treats port-only values as URLs', () => {
      // '8080' is not in the truthy/falsy lists, so it's treated as a URL
      expect(parseSpotlightEnvValue('8080')).toBe('8080');
    });
  });
});

describe('resolveSpotlightValue', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(debugLogger.debug, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('Case 1: Config false - DISABLED', () => {
    it('returns false and ignores env var', () => {
      expect(resolveSpotlightValue(false, 'http://localhost:8969/stream')).toBe(false);
    });

    it('logs warning when env var is set', () => {
      resolveSpotlightValue(false, 'http://localhost:8969/stream');
      expect(warnSpy).toHaveBeenCalledWith(
        'Spotlight disabled via config, ignoring SENTRY_SPOTLIGHT environment variable',
      );
    });

    it('does not log warning when env var is undefined', () => {
      resolveSpotlightValue(false, undefined);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Case 2: Config URL string - USE CONFIG URL', () => {
    it('returns config URL', () => {
      expect(resolveSpotlightValue('http://config-url:8080', 'http://env-url:9090')).toBe('http://config-url:8080');
    });

    it('logs warning when env var is also a URL', () => {
      resolveSpotlightValue('http://config-url:8080', 'http://env-url:9090');
      expect(warnSpy).toHaveBeenCalledWith(
        'Spotlight config URL takes precedence over SENTRY_SPOTLIGHT environment variable',
      );
    });

    it('does not log warning when env var is not a URL', () => {
      resolveSpotlightValue('http://config-url:8080', true);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not log warning when env var is undefined', () => {
      resolveSpotlightValue('http://config-url:8080', undefined);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Case 3: Config true + Env URL - USE ENV VAR URL (key case!)', () => {
    it('returns env var URL when config is true', () => {
      expect(resolveSpotlightValue(true, 'http://localhost:8969/stream')).toBe('http://localhost:8969/stream');
    });
  });

  describe('Case 4: Config true + Env bool/undefined - USE DEFAULT URL', () => {
    it('returns true when env var is true', () => {
      expect(resolveSpotlightValue(true, true)).toBe(true);
    });

    it('returns true when env var is false', () => {
      // Config true wins over env false - this is the expected behavior per precedence
      expect(resolveSpotlightValue(true, false)).toBe(true);
    });

    it('returns true when env var is undefined', () => {
      expect(resolveSpotlightValue(true, undefined)).toBe(true);
    });
  });

  describe('Case 5: Config undefined - USE ENV VAR VALUE', () => {
    it('returns env var URL', () => {
      expect(resolveSpotlightValue(undefined, 'http://localhost:8969/stream')).toBe('http://localhost:8969/stream');
    });

    it('returns env var true', () => {
      expect(resolveSpotlightValue(undefined, true)).toBe(true);
    });

    it('returns env var false', () => {
      expect(resolveSpotlightValue(undefined, false)).toBe(false);
    });

    it('returns undefined when env var is undefined', () => {
      expect(resolveSpotlightValue(undefined, undefined)).toBe(undefined);
    });
  });
});
