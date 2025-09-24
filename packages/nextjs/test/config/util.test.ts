import { describe, expect, it } from 'vitest';
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
});
