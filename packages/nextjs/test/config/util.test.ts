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

  describe('isTurbopackDefaultForVersion', () => {
    describe('returns true for versions where turbopack is default', () => {
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

        // Next.js 15.6.0-canary.40+ (boundary case)
        ['15.6.0-canary.40', 'Next.js 15.6.0-canary.40 (exact threshold)'],
        ['15.6.0-canary.41', 'Next.js 15.6.0-canary.41'],
        ['15.6.0-canary.42', 'Next.js 15.6.0-canary.42'],
        ['15.6.0-canary.100', 'Next.js 15.6.0-canary.100'],

        // Next.js 15.7+ canary versions
        ['15.7.0-canary.1', 'Next.js 15.7.0-canary.1'],
        ['15.7.0-canary.50', 'Next.js 15.7.0-canary.50'],
        ['15.8.0-canary.1', 'Next.js 15.8.0-canary.1'],
        ['15.10.0-canary.1', 'Next.js 15.10.0-canary.1'],
      ])('returns true for %s (%s)', version => {
        expect(util.isTurbopackDefaultForVersion(version)).toBe(true);
      });
    });

    describe('returns false for versions where webpack is still default', () => {
      it.each([
        // Next.js 15.6.0-canary.39 and below
        ['15.6.0-canary.39', 'Next.js 15.6.0-canary.39 (just below threshold)'],
        ['15.6.0-canary.36', 'Next.js 15.6.0-canary.36'],
        ['15.6.0-canary.38', 'Next.js 15.6.0-canary.38'],
        ['15.6.0-canary.0', 'Next.js 15.6.0-canary.0'],

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
        expect(util.isTurbopackDefaultForVersion(version)).toBe(false);
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
        expect(util.isTurbopackDefaultForVersion(version)).toBe(false);
      });
    });

    describe('canary number parsing edge cases', () => {
      it.each([
        ['15.6.0-canary.', 'canary with no number'],
        ['15.6.0-canary.abc', 'canary with non-numeric value'],
        ['15.6.0-canary.38.extra', 'canary with extra segments'],
      ])('handles malformed canary versions: %s (%s)', version => {
        // Should not throw, just return appropriate boolean
        expect(() => util.isTurbopackDefaultForVersion(version)).not.toThrow();
      });

      it('handles canary.40 exactly (boundary)', () => {
        expect(util.isTurbopackDefaultForVersion('15.6.0-canary.40')).toBe(true);
      });

      it('handles canary.39 exactly (boundary)', () => {
        expect(util.isTurbopackDefaultForVersion('15.6.0-canary.39')).toBe(false);
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
      delete process.env.NEXT_RSPACK;
    });

    afterEach(() => {
      process.argv = originalArgv;
      process.env = originalEnv;
    });

    it('returns turbopack when TURBOPACK env var is set', () => {
      process.env.TURBOPACK = '1';
      expect(util.detectActiveBundler('15.5.0')).toBe('turbopack');
    });

    it('returns webpack when --webpack flag is present', () => {
      process.argv.push('--webpack');
      expect(util.detectActiveBundler('16.0.0')).toBe('webpack');
    });

    it('returns webpack when NEXT_RSPACK env var is set', () => {
      process.env.NEXT_RSPACK = 'true';
      expect(util.detectActiveBundler('16.0.0')).toBe('webpack');
    });

    it('returns turbopack for Next.js 16+ by default', () => {
      expect(util.detectActiveBundler('16.0.0')).toBe('turbopack');
      expect(util.detectActiveBundler('17.0.0')).toBe('turbopack');
    });

    it('returns turbopack for Next.js 15.6.0-canary.40+', () => {
      expect(util.detectActiveBundler('15.6.0-canary.40')).toBe('turbopack');
      expect(util.detectActiveBundler('15.6.0-canary.50')).toBe('turbopack');
    });

    it('returns webpack for Next.js 15.6.0 stable', () => {
      expect(util.detectActiveBundler('15.6.0')).toBe('webpack');
    });

    it('returns webpack for Next.js 15.5.x and below', () => {
      expect(util.detectActiveBundler('15.5.0')).toBe('webpack');
      expect(util.detectActiveBundler('15.0.0')).toBe('webpack');
      expect(util.detectActiveBundler('14.2.0')).toBe('webpack');
    });

    it('returns webpack when version is undefined', () => {
      expect(util.detectActiveBundler(undefined)).toBe('webpack');
    });

    it('prioritizes TURBOPACK env var over version detection', () => {
      process.env.TURBOPACK = '1';
      expect(util.detectActiveBundler('14.0.0')).toBe('turbopack');
    });

    it('prioritizes --webpack flag over version detection', () => {
      process.argv.push('--webpack');
      expect(util.detectActiveBundler('16.0.0')).toBe('webpack');
    });

    it('prioritizes TURBOPACK env var over --webpack flag', () => {
      process.env.TURBOPACK = '1';
      process.argv.push('--webpack');
      expect(util.detectActiveBundler('15.5.0')).toBe('turbopack');
    });

    it('prioritizes TURBOPACK env var over NEXT_RSPACK env var', () => {
      process.env.TURBOPACK = '1';
      process.env.NEXT_RSPACK = 'true';
      expect(util.detectActiveBundler('15.5.0')).toBe('turbopack');
    });
  });
});
