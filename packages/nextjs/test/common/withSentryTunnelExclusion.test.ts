import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withSentryTunnelExclusion } from '../../src/common/withSentryTunnelExclusion';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRewritesTunnelPath?: string | null;
};

describe('withSentryTunnelExclusion', () => {
  let originalEnv: string | undefined;
  let originalGlobal: unknown;

  beforeEach(() => {
    // Save original values
    originalEnv = process.env._sentryRewritesTunnelPath;
    originalGlobal = globalWithInjectedValues._sentryRewritesTunnelPath;
  });

  afterEach(() => {
    // Restore original values
    if (originalEnv === undefined) {
      delete process.env._sentryRewritesTunnelPath;
    } else {
      process.env._sentryRewritesTunnelPath = originalEnv;
    }

    if (originalGlobal === undefined) {
      delete globalWithInjectedValues._sentryRewritesTunnelPath;
    } else {
      // @ts-expect-error - we're resetting the value to the original value
      globalWithInjectedValues._sentryRewritesTunnelPath = originalGlobal;
    }
  });

  describe('when no tunnel path is configured', () => {
    beforeEach(() => {
      delete process.env._sentryRewritesTunnelPath;
      delete globalWithInjectedValues._sentryRewritesTunnelPath;
    });

    it('should return string matcher unchanged', () => {
      const result = withSentryTunnelExclusion('/api/:path*');
      expect(result).toBe('/api/:path*');
    });

    it('should return array matcher unchanged', () => {
      const matcher = ['/api/:path*', '/admin/:path*'];
      const result = withSentryTunnelExclusion(matcher);
      expect(result).toBe(matcher);
      expect(result).toEqual(['/api/:path*', '/admin/:path*']);
    });
  });

  describe('when tunnel path is configured via process.env', () => {
    beforeEach(() => {
      process.env._sentryRewritesTunnelPath = '/sentry-tunnel';
    });

    it('should add exclusion pattern to string matcher', () => {
      const result = withSentryTunnelExclusion('/api/:path*');
      expect(result).toEqual(['/api/:path*', '/((?!sentry-tunnel).*)']);
    });

    it('should add exclusion pattern to array matcher', () => {
      const result = withSentryTunnelExclusion(['/api/:path*', '/admin/:path*']);
      expect(result).toEqual(['/api/:path*', '/admin/:path*', '/((?!sentry-tunnel).*)']);
    });

    it('should handle tunnel path without leading slash', () => {
      process.env._sentryRewritesTunnelPath = 'tunnel-route';
      const result = withSentryTunnelExclusion('/api/:path*');
      expect(result).toEqual(['/api/:path*', '/((?!tunnel-route).*)']);
    });

    it('should handle tunnel path with leading slash', () => {
      process.env._sentryRewritesTunnelPath = '/tunnel-route';
      const result = withSentryTunnelExclusion('/api/:path*');
      expect(result).toEqual(['/api/:path*', '/((?!tunnel-route).*)']);
    });

    it('should work with random generated tunnel paths', () => {
      process.env._sentryRewritesTunnelPath = '/abc123xyz';
      const result = withSentryTunnelExclusion(['/api/:path*']);
      expect(result).toEqual(['/api/:path*', '/((?!abc123xyz).*)']);
    });

    it('should work with empty array matcher', () => {
      const result = withSentryTunnelExclusion([]);
      expect(result).toEqual(['/((?!sentry-tunnel).*)']);
    });
  });

  describe('when tunnel path is configured via GLOBAL_OBJ', () => {
    beforeEach(() => {
      delete process.env._sentryRewritesTunnelPath;
      globalWithInjectedValues._sentryRewritesTunnelPath = '/global-tunnel';
    });

    it('should add exclusion pattern using global value', () => {
      const result = withSentryTunnelExclusion('/api/:path*');
      expect(result).toEqual(['/api/:path*', '/((?!global-tunnel).*)']);
    });

    it('should prefer process.env over GLOBAL_OBJ', () => {
      process.env._sentryRewritesTunnelPath = '/env-tunnel';
      const result = withSentryTunnelExclusion('/api/:path*');
      expect(result).toEqual(['/api/:path*', '/((?!env-tunnel).*)']);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      process.env._sentryRewritesTunnelPath = '/tunnel';
    });

    it('should handle single slash matcher', () => {
      const result = withSentryTunnelExclusion('/');
      expect(result).toEqual(['/', '/((?!tunnel).*)']);
    });

    it('should handle complex path patterns', () => {
      const result = withSentryTunnelExclusion([
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
        '/api/protected/:path*',
      ]);
      expect(result).toEqual([
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
        '/api/protected/:path*',
        '/((?!tunnel).*)',
      ]);
    });

    it('should handle matcher with special regex characters in tunnel path', () => {
      process.env._sentryRewritesTunnelPath = '/tunnel-route-123';
      const result = withSentryTunnelExclusion('/api/:path*');
      expect(result).toEqual(['/api/:path*', '/((?!tunnel-route-123).*)']);
    });
  });

  describe('real-world usage patterns', () => {
    beforeEach(() => {
      process.env._sentryRewritesTunnelPath = '/monitoring';
    });

    it('should work with typical API route matchers', () => {
      const result = withSentryTunnelExclusion(['/api/:path*', '/trpc/:path*']);
      expect(result).toEqual(['/api/:path*', '/trpc/:path*', '/((?!monitoring).*)']);
    });

    it('should work with exclusion-based matchers', () => {
      const result = withSentryTunnelExclusion('/((?!_next/static|_next/image|favicon.ico).*)');
      expect(result).toEqual(['/((?!_next/static|_next/image|favicon.ico).*)', '/((?!monitoring).*)']);
    });

    it('should work with admin and protected routes', () => {
      const result = withSentryTunnelExclusion(['/admin/:path*', '/dashboard/:path*', '/api/auth/:path*']);
      expect(result).toEqual(['/admin/:path*', '/dashboard/:path*', '/api/auth/:path*', '/((?!monitoring).*)']);
    });
  });
});
