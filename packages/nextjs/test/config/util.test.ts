import { parseSemver } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as util from '../../src/config/util';

vi.mock('@sentry/core', () => ({
  parseSemver: vi.fn(),
}));

describe('util', () => {
  describe('supportsProductionCompileHook', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('supported versions', () => {
      it('returns true for Next.js 15.4.1', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 4, patch: 1 });
        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns true for Next.js 15.4.2', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.2');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 4, patch: 2 });
        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns true for Next.js 15.5.0', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.5.0');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 5, patch: 0 });
        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns true for Next.js 16.0.0', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('16.0.0');
        (parseSemver as any).mockReturnValue({ major: 16, minor: 0, patch: 0 });
        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns true for Next.js 17.0.0', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('17.0.0');
        (parseSemver as any).mockReturnValue({ major: 17, minor: 0, patch: 0 });
        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns true for supported canary versions', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1-canary.42');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 4, patch: 1 });
        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns true for supported rc versions', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1-rc.1');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 4, patch: 1 });
        expect(util.supportsProductionCompileHook()).toBe(true);
      });
    });

    describe('unsupported versions', () => {
      it('returns false for Next.js 15.4.0', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 4, patch: 0 });
        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('returns false for Next.js 15.3.9', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.9');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 3, patch: 9 });
        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('returns false for Next.js 15.0.0', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.0.0');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 0, patch: 0 });
        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('returns false for Next.js 14.2.0', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('14.2.0');
        (parseSemver as any).mockReturnValue({ major: 14, minor: 2, patch: 0 });
        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('returns false for unsupported canary versions', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0-canary.42');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 4, patch: 0 });
        expect(util.supportsProductionCompileHook()).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('returns false for invalid version strings', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('invalid.version');
        (parseSemver as any).mockReturnValue({ major: undefined, minor: undefined, patch: undefined });
        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('handles versions with build metadata', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1+build.123');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 4, patch: 1 });
        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('handles versions with pre-release identifiers', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1-alpha.1');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 4, patch: 1 });
        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns false for versions missing patch number', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 4, patch: undefined });
        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('returns false for versions missing minor number', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15');
        (parseSemver as any).mockReturnValue({ major: 15, minor: undefined, patch: undefined });
        expect(util.supportsProductionCompileHook()).toBe(false);
      });
    });

    describe('version boundary tests', () => {
      it('returns false for 15.4.0 (just below threshold)', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 4, patch: 0 });
        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('returns true for 15.4.1 (exact threshold)', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 4, patch: 1 });
        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns true for 15.4.2 (just above threshold)', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.2');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 4, patch: 2 });
        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns false for 15.3.999 (high patch but wrong minor)', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.999');
        (parseSemver as any).mockReturnValue({ major: 15, minor: 3, patch: 999 });
        expect(util.supportsProductionCompileHook()).toBe(false);
      });
    });
  });
});
