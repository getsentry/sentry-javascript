import * as fs from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as util from '../../src/config/util';

// Mock fs to control what getNextjsVersion reads
vi.mock('fs');

describe('util', () => {
  describe('supportsProductionCompileHook', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('supported versions', () => {
      it('returns true for Next.js 15.4.1', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.4.1' }));

        const result = util.supportsProductionCompileHook();
        expect(result).toBe(true);
      });

      it('returns true for Next.js 15.4.2', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.4.2' }));

        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns true for Next.js 15.5.0', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.5.0' }));

        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns true for Next.js 16.0.0', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '16.0.0' }));

        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns true for Next.js 17.0.0', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '17.0.0' }));

        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns true for supported canary versions', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.4.1-canary.42' }));

        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns true for supported rc versions', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.4.1-rc.1' }));

        expect(util.supportsProductionCompileHook()).toBe(true);
      });
    });

    describe('unsupported versions', () => {
      it('returns false for Next.js 15.4.0', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.4.0' }));

        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('returns false for Next.js 15.3.9', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.3.9' }));

        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('returns false for Next.js 15.0.0', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.0.0' }));

        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('returns false for Next.js 14.2.0', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '14.2.0' }));

        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('returns false for unsupported canary versions', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.4.0-canary.42' }));

        expect(util.supportsProductionCompileHook()).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('returns false for invalid version strings', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: 'invalid.version' }));

        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('handles versions with build metadata', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.4.1+build.123' }));

        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('handles versions with pre-release identifiers', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.4.1-alpha.1' }));

        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns false for versions missing patch number', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.4' }));

        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('returns false for versions missing minor number', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15' }));

        expect(util.supportsProductionCompileHook()).toBe(false);
      });
    });

    describe('version boundary tests', () => {
      it('returns false for 15.4.0 (just below threshold)', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.4.0' }));

        expect(util.supportsProductionCompileHook()).toBe(false);
      });

      it('returns true for 15.4.1 (exact threshold)', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.4.1' }));

        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns true for 15.4.2 (just above threshold)', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.4.2' }));

        expect(util.supportsProductionCompileHook()).toBe(true);
      });

      it('returns false for 15.3.999 (high patch but wrong minor)', () => {
        const mockReadFileSync = fs.readFileSync as any;
        mockReadFileSync.mockReturnValue(JSON.stringify({ version: '15.3.999' }));

        expect(util.supportsProductionCompileHook()).toBe(false);
      });
    });
  });
});
