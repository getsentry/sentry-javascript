import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withSentryMiddlewareConfig, withSentryProxyConfig } from '../../src/common/withSentryMiddlewareConfig';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRewritesTunnelPath?: string | null;
};

describe('withSentryMiddlewareConfig', () => {
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

    it('should return config unchanged', () => {
      const config = { matcher: ['/api/:path*', '/admin/:path*'] };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual(config);
    });

    it('should return config with no matcher unchanged', () => {
      const config = { someOtherOption: true };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual(config);
    });

    it('should preserve other config properties', () => {
      const config = { matcher: ['/api/:path*'], regions: ['us-east-1'], custom: true };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual(config);
    });
  });

  describe('when tunnel path is configured via process.env', () => {
    beforeEach(() => {
      process.env._sentryRewritesTunnelPath = '/sentry-tunnel';
    });

    it('should add exclusion pattern to config with string matcher', () => {
      const config = { matcher: '/api/:path*' };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/api/:path*', '/((?!sentry-tunnel).*)'],
      });
    });

    it('should add exclusion pattern to config with array matcher', () => {
      const config = { matcher: ['/api/:path*', '/admin/:path*'] };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/api/:path*', '/admin/:path*', '/((?!sentry-tunnel).*)'],
      });
    });

    it('should handle tunnel path without leading slash', () => {
      process.env._sentryRewritesTunnelPath = 'tunnel-route';
      const config = { matcher: '/api/:path*' };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/api/:path*', '/((?!tunnel-route).*)'],
      });
    });

    it('should handle tunnel path with leading slash', () => {
      process.env._sentryRewritesTunnelPath = '/tunnel-route';
      const config = { matcher: '/api/:path*' };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/api/:path*', '/((?!tunnel-route).*)'],
      });
    });

    it('should work with random generated tunnel paths', () => {
      process.env._sentryRewritesTunnelPath = '/abc123xyz';
      const config = { matcher: ['/api/:path*'] };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/api/:path*', '/((?!abc123xyz).*)'],
      });
    });

    it('should work with empty array matcher', () => {
      const config = { matcher: [] };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/((?!sentry-tunnel).*)'],
      });
    });

    it('should preserve other config properties', () => {
      const config = { matcher: ['/api/:path*'], regions: ['us-east-1'], custom: true };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/api/:path*', '/((?!sentry-tunnel).*)'],
        regions: ['us-east-1'],
        custom: true,
      });
    });
  });

  describe('when tunnel path is configured via GLOBAL_OBJ', () => {
    beforeEach(() => {
      delete process.env._sentryRewritesTunnelPath;
      globalWithInjectedValues._sentryRewritesTunnelPath = '/global-tunnel';
    });

    it('should add exclusion pattern using global value', () => {
      const config = { matcher: '/api/:path*' };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/api/:path*', '/((?!global-tunnel).*)'],
      });
    });

    it('should prefer process.env over GLOBAL_OBJ', () => {
      process.env._sentryRewritesTunnelPath = '/env-tunnel';
      const config = { matcher: '/api/:path*' };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/api/:path*', '/((?!env-tunnel).*)'],
      });
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      process.env._sentryRewritesTunnelPath = '/tunnel';
    });

    it('should handle single slash matcher', () => {
      const config = { matcher: '/' };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/', '/((?!tunnel).*)'],
      });
    });

    it('should handle complex path patterns', () => {
      const config = {
        matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)', '/api/protected/:path*'],
      };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)', '/api/protected/:path*', '/((?!tunnel).*)'],
      });
    });

    it('should handle matcher with special regex characters in tunnel path', () => {
      process.env._sentryRewritesTunnelPath = '/tunnel-route-123';
      const config = { matcher: '/api/:path*' };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/api/:path*', '/((?!tunnel-route-123).*)'],
      });
    });
  });

  describe('real-world usage patterns', () => {
    beforeEach(() => {
      process.env._sentryRewritesTunnelPath = '/monitoring';
    });

    it('should work with typical API route matchers', () => {
      const config = { matcher: ['/api/:path*', '/trpc/:path*'] };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/api/:path*', '/trpc/:path*', '/((?!monitoring).*)'],
      });
    });

    it('should work with exclusion-based matchers', () => {
      const config = { matcher: '/((?!_next/static|_next/image|favicon.ico).*)' };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/((?!_next/static|_next/image|favicon.ico).*)', '/((?!monitoring).*)'],
      });
    });

    it('should work with admin and protected routes', () => {
      const config = { matcher: ['/admin/:path*', '/dashboard/:path*', '/api/auth/:path*'] };
      const result = withSentryMiddlewareConfig(config);
      expect(result).toEqual({
        matcher: ['/admin/:path*', '/dashboard/:path*', '/api/auth/:path*', '/((?!monitoring).*)'],
      });
    });
  });

  describe('withSentryProxyConfig alias', () => {
    beforeEach(() => {
      process.env._sentryRewritesTunnelPath = '/sentry-tunnel';
    });

    it('should be an alias for withSentryMiddlewareConfig', () => {
      expect(withSentryProxyConfig).toBe(withSentryMiddlewareConfig);
    });

    it('should work identically to withSentryMiddlewareConfig', () => {
      const config = { matcher: ['/api/:path*'] };
      const resultMiddleware = withSentryMiddlewareConfig(config);
      const resultProxy = withSentryProxyConfig(config);
      expect(resultProxy).toEqual(resultMiddleware);
    });
  });
});
