import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as util from '../../src/config/util';

describe('util', () => {
  describe('supportsProductionCompileHook', () => {
    describe('supported versions', () => {
      it('returns true for Next.js 15.4.1', () => {
        const result = util.supportsProductionCompileHook('15.4.1');
        expect(result).toBe(true);
      });

      it('returns true for Next.js 15.4.2', () => {
        expect(util.supportsProductionCompileHook('15.4.2')).toBe(true);
      });

      it('returns true for Next.js 15.5.0', () => {
        expect(util.supportsProductionCompileHook('15.5.0')).toBe(true);
      });

      it('returns true for Next.js 16.0.0', () => {
        expect(util.supportsProductionCompileHook('16.0.0')).toBe(true);
      });

      it('returns true for Next.js 17.0.0', () => {
        expect(util.supportsProductionCompileHook('17.0.0')).toBe(true);
      });

      it('returns true for supported canary versions', () => {
        expect(util.supportsProductionCompileHook('15.4.1-canary.42')).toBe(true);
      });

      it('returns true for supported rc versions', () => {
        expect(util.supportsProductionCompileHook('15.4.1-rc.1')).toBe(true);
      });
    });

    describe('unsupported versions', () => {
      it('returns false for Next.js 15.4.0', () => {
        expect(util.supportsProductionCompileHook('15.4.0')).toBe(false);
      });

      it('returns false for Next.js 15.3.9', () => {
        expect(util.supportsProductionCompileHook('15.3.9')).toBe(false);
      });

      it('returns false for Next.js 15.0.0', () => {
        expect(util.supportsProductionCompileHook('15.0.0')).toBe(false);
      });

      it('returns false for Next.js 14.2.0', () => {
        expect(util.supportsProductionCompileHook('14.2.0')).toBe(false);
      });

      it('returns false for unsupported canary versions', () => {
        expect(util.supportsProductionCompileHook('15.4.0-canary.42')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('returns false for invalid version strings', () => {
        expect(util.supportsProductionCompileHook('invalid.version')).toBe(false);
      });

      it('handles versions with build metadata', () => {
        expect(util.supportsProductionCompileHook('15.4.1+build.123')).toBe(true);
      });

      it('handles versions with pre-release identifiers', () => {
        expect(util.supportsProductionCompileHook('15.4.1-alpha.1')).toBe(true);
      });

      it('returns false for versions missing patch number', () => {
        expect(util.supportsProductionCompileHook('15.4')).toBe(false);
      });

      it('returns false for versions missing minor number', () => {
        expect(util.supportsProductionCompileHook('15')).toBe(false);
      });
    });

    describe('version boundary tests', () => {
      it('returns false for 15.4.0 (just below threshold)', () => {
        expect(util.supportsProductionCompileHook('15.4.0')).toBe(false);
      });

      it('returns true for 15.4.1 (exact threshold)', () => {
        expect(util.supportsProductionCompileHook('15.4.1')).toBe(true);
      });

      it('returns true for 15.4.2 (just above threshold)', () => {
        expect(util.supportsProductionCompileHook('15.4.2')).toBe(true);
      });

      it('returns false for 15.3.999 (high patch but wrong minor)', () => {
        expect(util.supportsProductionCompileHook('15.3.999')).toBe(false);
      });
    });
  });

  describe('supportsNativeDebugIds', () => {
    describe('supported versions', () => {
      it.each([
        // Next.js 16+ stable versions
        ['16.0.0', 'Next.js 16.0.0 stable'],
        ['16.0.1', 'Next.js 16.0.1 stable'],
        ['16.1.0', 'Next.js 16.1.0 stable'],
        ['16.2.5', 'Next.js 16.2.5 stable'],

        // Next.js 16+ pre-release versions
        ['16.0.0-rc.1', 'Next.js 16.0.0-rc.1'],
        ['16.0.0-canary.1', 'Next.js 16.0.0-canary.1'],
        ['16.1.0-beta.2', 'Next.js 16.1.0-beta.2'],

        // Next.js 17+
        ['17.0.0', 'Next.js 17.0.0'],
        ['18.0.0', 'Next.js 18.0.0'],
        ['20.0.0', 'Next.js 20.0.0'],

        // Next.js 15.6.0-canary.36+ (boundary case)
        ['15.6.0-canary.36', 'Next.js 15.6.0-canary.36 (exact threshold)'],
        ['15.6.0-canary.37', 'Next.js 15.6.0-canary.37'],
        ['15.6.0-canary.38', 'Next.js 15.6.0-canary.38'],
        ['15.6.0-canary.40', 'Next.js 15.6.0-canary.40'],
        ['15.6.0-canary.100', 'Next.js 15.6.0-canary.100'],

        // Next.js 15.7+ canary versions
        ['15.7.0-canary.1', 'Next.js 15.7.0-canary.1'],
        ['15.7.0-canary.50', 'Next.js 15.7.0-canary.50'],
        ['15.8.0-canary.1', 'Next.js 15.8.0-canary.1'],
        ['15.10.0-canary.1', 'Next.js 15.10.0-canary.1'],
      ])('returns true for %s (%s)', version => {
        expect(util.supportsNativeDebugIds(version)).toBe(true);
      });
    });

    describe('unsupported versions', () => {
      it.each([
        // Next.js 15.6.0-canary.35 and below
        ['15.6.0-canary.35', 'Next.js 15.6.0-canary.35 (just below threshold)'],
        ['15.6.0-canary.34', 'Next.js 15.6.0-canary.34'],
        ['15.6.0-canary.0', 'Next.js 15.6.0-canary.0'],
        ['15.6.0-canary.1', 'Next.js 15.6.0-canary.1'],

        // Next.js 15.6.x stable releases (NOT canary)
        ['15.6.0', 'Next.js 15.6.0 stable'],
        ['15.6.1', 'Next.js 15.6.1 stable'],
        ['15.6.2', 'Next.js 15.6.2 stable'],
        ['15.6.10', 'Next.js 15.6.10 stable'],

        // Next.js 15.6.x rc releases (NOT canary)
        ['15.6.0-rc.1', 'Next.js 15.6.0-rc.1'],
        ['15.6.0-rc.2', 'Next.js 15.6.0-rc.2'],

        // Next.js 15.7+ stable releases (NOT canary)
        ['15.7.0', 'Next.js 15.7.0 stable'],
        ['15.8.0', 'Next.js 15.8.0 stable'],
        ['15.10.0', 'Next.js 15.10.0 stable'],

        // Next.js 15.7+ rc/beta releases (NOT canary)
        ['15.7.0-rc.1', 'Next.js 15.7.0-rc.1'],
        ['15.7.0-beta.1', 'Next.js 15.7.0-beta.1'],

        // Next.js 15.5 and below (all versions)
        ['15.5.0', 'Next.js 15.5.0'],
        ['15.5.0-canary.100', 'Next.js 15.5.0-canary.100'],
        ['15.4.1', 'Next.js 15.4.1'],
        ['15.0.0', 'Next.js 15.0.0'],
        ['15.0.0-canary.1', 'Next.js 15.0.0-canary.1'],

        // Next.js 14.x and below
        ['14.2.0', 'Next.js 14.2.0'],
        ['14.0.0', 'Next.js 14.0.0'],
        ['14.0.0-canary.50', 'Next.js 14.0.0-canary.50'],
        ['13.5.0', 'Next.js 13.5.0'],
        ['13.0.0', 'Next.js 13.0.0'],
        ['12.0.0', 'Next.js 12.0.0'],
      ])('returns false for %s (%s)', version => {
        expect(util.supportsNativeDebugIds(version)).toBe(false);
      });
    });

    describe('edge cases', () => {
      it.each([
        ['', 'empty string'],
        ['invalid', 'invalid version string'],
        ['15', 'missing minor and patch'],
        ['15.6', 'missing patch'],
        ['not.a.version', 'completely invalid'],
        ['15.6.0-alpha.1', 'alpha prerelease (not canary)'],
        ['15.6.0-beta.1', 'beta prerelease (not canary)'],
      ])('returns false for %s (%s)', version => {
        expect(util.supportsNativeDebugIds(version)).toBe(false);
      });
    });

    describe('canary number parsing edge cases', () => {
      it.each([
        ['15.6.0-canary.', 'canary with no number'],
        ['15.6.0-canary.abc', 'canary with non-numeric value'],
        ['15.6.0-canary.35.extra', 'canary with extra segments'],
      ])('handles malformed canary versions: %s (%s)', version => {
        // Should not throw, just return appropriate boolean
        expect(() => util.supportsNativeDebugIds(version)).not.toThrow();
      });

      it('handles canary.36 exactly (boundary)', () => {
        expect(util.supportsNativeDebugIds('15.6.0-canary.36')).toBe(true);
      });

      it('handles canary.35 exactly (boundary)', () => {
        expect(util.supportsNativeDebugIds('15.6.0-canary.35')).toBe(false);
      });
    });
  });

  describe('requiresInstrumentationHook', () => {
    describe('versions that do NOT require the hook (returns false)', () => {
      it.each([
        // Fully supported releases (15.0.0 or higher)
        ['15.0.0', 'Next.js 15.0.0'],
        ['15.0.1', 'Next.js 15.0.1'],
        ['15.1.0', 'Next.js 15.1.0'],
        ['15.2.0', 'Next.js 15.2.0'],
        ['16.0.0', 'Next.js 16.0.0'],
        ['17.0.0', 'Next.js 17.0.0'],
        ['20.0.0', 'Next.js 20.0.0'],

        // Supported v15.0.0-rc.1 or higher
        ['15.0.0-rc.1', 'Next.js 15.0.0-rc.1'],
        ['15.0.0-rc.2', 'Next.js 15.0.0-rc.2'],
        ['15.0.0-rc.5', 'Next.js 15.0.0-rc.5'],
        ['15.0.0-rc.100', 'Next.js 15.0.0-rc.100'],

        // Supported v15.0.0-canary.124 or higher
        ['15.0.0-canary.124', 'Next.js 15.0.0-canary.124 (exact threshold)'],
        ['15.0.0-canary.125', 'Next.js 15.0.0-canary.125'],
        ['15.0.0-canary.130', 'Next.js 15.0.0-canary.130'],
        ['15.0.0-canary.200', 'Next.js 15.0.0-canary.200'],

        // Next.js 16+ prerelease versions (all supported)
        ['16.0.0-beta.0', 'Next.js 16.0.0-beta.0'],
        ['16.0.0-beta.1', 'Next.js 16.0.0-beta.1'],
        ['16.0.0-rc.0', 'Next.js 16.0.0-rc.0'],
        ['16.0.0-rc.1', 'Next.js 16.0.0-rc.1'],
        ['16.0.0-canary.1', 'Next.js 16.0.0-canary.1'],
        ['16.0.0-alpha.1', 'Next.js 16.0.0-alpha.1'],
        ['17.0.0-canary.1', 'Next.js 17.0.0-canary.1'],
      ])('returns false for %s (%s)', version => {
        expect(util.requiresInstrumentationHook(version)).toBe(false);
      });
    });

    describe('versions that DO require the hook (returns true)', () => {
      it.each([
        // Next.js 14 and below
        ['14.2.0', 'Next.js 14.2.0'],
        ['14.0.0', 'Next.js 14.0.0'],
        ['13.5.0', 'Next.js 13.5.0'],
        ['12.0.0', 'Next.js 12.0.0'],

        // Unsupported v15.0.0-rc.0
        ['15.0.0-rc.0', 'Next.js 15.0.0-rc.0'],

        // Unsupported v15.0.0-canary versions below 124
        ['15.0.0-canary.123', 'Next.js 15.0.0-canary.123'],
        ['15.0.0-canary.100', 'Next.js 15.0.0-canary.100'],
        ['15.0.0-canary.50', 'Next.js 15.0.0-canary.50'],
        ['15.0.0-canary.1', 'Next.js 15.0.0-canary.1'],
        ['15.0.0-canary.0', 'Next.js 15.0.0-canary.0'],

        // Other prerelease versions
        ['15.0.0-alpha.1', 'Next.js 15.0.0-alpha.1'],
        ['15.0.0-beta.1', 'Next.js 15.0.0-beta.1'],
      ])('returns true for %s (%s)', version => {
        expect(util.requiresInstrumentationHook(version)).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('returns true for empty string', () => {
        expect(util.requiresInstrumentationHook('')).toBe(true);
      });

      it('returns true for invalid version strings', () => {
        expect(util.requiresInstrumentationHook('invalid.version')).toBe(true);
      });

      it('returns true for versions missing patch number', () => {
        expect(util.requiresInstrumentationHook('15.4')).toBe(true);
      });

      it('returns true for versions missing minor number', () => {
        expect(util.requiresInstrumentationHook('15')).toBe(true);
      });
    });
  });

  describe('detectActiveBundler', () => {
    const originalArgv = process.argv;
    const originalEnv = process.env;

    beforeEach(() => {
      process.argv = [...originalArgv];
      process.env = { ...originalEnv };
      delete process.env.TURBOPACK;
    });

    afterEach(() => {
      process.argv = originalArgv;
      process.env = originalEnv;
    });

    it('returns turbopack when TURBOPACK env var is set', () => {
      process.env.TURBOPACK = '1';
      expect(util.detectActiveBundler()).toBe('turbopack');
    });

    it('returns turbopack when TURBOPACK env var is set to auto', () => {
      process.env.TURBOPACK = 'auto';
      expect(util.detectActiveBundler()).toBe('turbopack');
    });

    it('returns webpack when TURBOPACK env var is undefined', () => {
      process.env.TURBOPACK = undefined;
      expect(util.detectActiveBundler()).toBe('webpack');
    });

    it('returns webpack when TURBOPACK env var is false', () => {
      process.env.TURBOPACK = 'false';
      expect(util.detectActiveBundler()).toBe('webpack');
    });

    it('returns webpack when TURBOPACK env var is not set', () => {
      expect(util.detectActiveBundler()).toBe('webpack');
    });
  });
});
