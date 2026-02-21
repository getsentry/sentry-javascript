import { describe, expect, it } from 'vitest';
import * as CloudflareExports from '../../src/cloudflare/index';

describe('Cloudflare entrypoint', () => {
  describe('exports', () => {
    it('exports wrapMiddlewaresWithSentry as a function (server implementation)', () => {
      expect(typeof CloudflareExports.wrapMiddlewaresWithSentry).toBe('function');

      // The server implementation wraps middlewares with Sentry instrumentation.
      // Verify it handles an empty object correctly (server impl returns an empty array).
      const result = CloudflareExports.wrapMiddlewaresWithSentry({});
      expect(result).toEqual([]);
    });

    it('exports sentryGlobalRequestMiddleware as a middleware object with server handler', () => {
      const middleware = CloudflareExports.sentryGlobalRequestMiddleware;
      expect(middleware).toBeDefined();
      // The server implementation has a server handler function, unlike the client no-op stub.
      expect(typeof middleware.options.server).toBe('function');
    });

    it('exports sentryGlobalFunctionMiddleware as a middleware object with server handler', () => {
      const middleware = CloudflareExports.sentryGlobalFunctionMiddleware;
      expect(middleware).toBeDefined();
      // The server implementation has a server handler function, unlike the client no-op stub.
      expect(typeof middleware.options.server).toBe('function');
    });

    it('exports wrapFetchWithSentry', () => {
      expect(typeof CloudflareExports.wrapFetchWithSentry).toBe('function');
    });
  });

  describe('ErrorBoundary', () => {
    it('is a passthrough that returns children directly', () => {
      const children = 'test child';
      const result = CloudflareExports.ErrorBoundary({ children });
      expect(result).toBe('test child');
    });

    it('returns null when no children are provided', () => {
      const result = CloudflareExports.ErrorBoundary({});
      expect(result).toBeNull();
    });

    it('calls children when children is a function', () => {
      const children = () => 'function result';
      const result = CloudflareExports.ErrorBoundary({ children });
      expect(result).toBe('function result');
    });
  });

  describe('withErrorBoundary', () => {
    it('is a passthrough that returns the original component', () => {
      const MockComponent = () => null;
      const result = CloudflareExports.withErrorBoundary(MockComponent);
      expect(result).toBe(MockComponent);
    });
  });
});
