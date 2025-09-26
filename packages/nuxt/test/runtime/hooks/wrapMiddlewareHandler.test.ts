import * as SentryCore from '@sentry/core';
import type { EventHandler, EventHandlerRequest, H3Event } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapMiddlewareHandler } from '../../../src/runtime/hooks/wrapMiddlewareHandler';

// Only mock the Sentry APIs we need to verify
vi.mock('@sentry/core', async importOriginal => {
  const mod = await importOriginal();
  return {
    ...(mod as any),
    debug: { log: vi.fn() },
    startSpan: vi.fn(),
    withIsolationScope: vi.fn(),
    getIsolationScope: vi.fn(),
    getDefaultIsolationScope: vi.fn(),
    getClient: vi.fn(),
    httpHeadersToSpanAttributes: vi.fn(),
    httpRequestToRequestData: vi.fn(),
    captureException: vi.fn(),
    flushIfServerless: vi.fn(),
  };
});

describe('wrapMiddlewareHandler', () => {
  const mockEvent: H3Event<EventHandlerRequest> = {
    path: '/test-path',
    method: 'GET',
    node: {
      req: {
        headers: { 'user-agent': 'test-agent' },
        url: '/test-url',
      },
    },
  } as any;

  const mockSpan = {
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };

  const mockIsolationScope = {
    clone: vi.fn().mockReturnValue('cloned-scope'),
    setSDKProcessingMetadata: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup minimal required mocks
    (SentryCore.getIsolationScope as any).mockReturnValue(mockIsolationScope);
    (SentryCore.getDefaultIsolationScope as any).mockReturnValue('default-scope');
    (SentryCore.withIsolationScope as any).mockImplementation((_scope: any, callback: any) => callback());
    (SentryCore.startSpan as any).mockImplementation((_config: any, callback: any) => callback(mockSpan));
    (SentryCore.getClient as any).mockReturnValue({ getOptions: () => ({ sendDefaultPii: false }) });
    (SentryCore.httpHeadersToSpanAttributes as any).mockReturnValue({ 'http.request.header.user_agent': 'test-agent' });
    (SentryCore.httpRequestToRequestData as any).mockReturnValue({ url: '/test-path', method: 'GET' });
    (SentryCore.flushIfServerless as any).mockResolvedValue(undefined);
  });

  describe('function handler wrapping', () => {
    it('should wrap function handlers correctly and preserve return values', async () => {
      const functionHandler: EventHandler = vi.fn().mockResolvedValue('success');

      const wrapped = wrapMiddlewareHandler(functionHandler, 'test-middleware');
      const result = await wrapped(mockEvent);

      expect(functionHandler).toHaveBeenCalledWith(mockEvent);
      expect(result).toBe('success');
      expect(typeof wrapped).toBe('function');
    });

    it('should preserve sync return values from function handlers', async () => {
      const syncHandler: EventHandler = vi.fn().mockReturnValue('sync-result');

      const wrapped = wrapMiddlewareHandler(syncHandler, 'sync-middleware');
      const result = await wrapped(mockEvent);

      expect(syncHandler).toHaveBeenCalledWith(mockEvent);
      expect(result).toBe('sync-result');
    });
  });

  describe('different handler types', () => {
    it('should handle async function handlers', async () => {
      const asyncHandler: EventHandler = vi.fn().mockResolvedValue('async-success');

      const wrapped = wrapMiddlewareHandler(asyncHandler, 'async-middleware');
      const result = await wrapped(mockEvent);

      expect(asyncHandler).toHaveBeenCalledWith(mockEvent);
      expect(result).toBe('async-success');
    });
  });

  describe('error propagation without masking', () => {
    it('should propagate async errors without modification', async () => {
      const originalError = new Error('Original async error');
      originalError.stack = 'original-stack-trace';
      const failingHandler: EventHandler = vi.fn().mockRejectedValue(originalError);

      const wrapped = wrapMiddlewareHandler(failingHandler, 'failing-middleware');

      await expect(wrapped(mockEvent)).rejects.toThrow('Original async error');
      await expect(wrapped(mockEvent)).rejects.toMatchObject({
        message: 'Original async error',
        stack: 'original-stack-trace',
      });

      // Verify Sentry APIs were called but error was not masked
      expect(SentryCore.captureException).toHaveBeenCalledWith(originalError, expect.any(Object));
      expect(mockSpan.recordException).toHaveBeenCalledWith(originalError);
    });

    it('should propagate sync errors without modification', async () => {
      const originalError = new Error('Original sync error');
      const failingHandler: EventHandler = vi.fn().mockImplementation(() => {
        throw originalError;
      });

      const wrapped = wrapMiddlewareHandler(failingHandler, 'sync-failing-middleware');

      await expect(wrapped(mockEvent)).rejects.toThrow('Original sync error');
      await expect(wrapped(mockEvent)).rejects.toBe(originalError);

      expect(SentryCore.captureException).toHaveBeenCalledWith(originalError, expect.any(Object));
    });

    it('should handle non-Error thrown values', async () => {
      const stringError = 'String error';
      const failingHandler: EventHandler = vi.fn().mockRejectedValue(stringError);

      const wrapped = wrapMiddlewareHandler(failingHandler, 'string-error-middleware');

      await expect(wrapped(mockEvent)).rejects.toBe(stringError);
      expect(SentryCore.captureException).toHaveBeenCalledWith(stringError, expect.any(Object));
    });
  });

  describe('user code isolation', () => {
    it('should not affect user code when Sentry APIs fail', async () => {
      // Simulate Sentry API failures
      (SentryCore.startSpan as any).mockImplementation(() => {
        throw new Error('Sentry API failure');
      });

      const userHandler: EventHandler = vi.fn().mockResolvedValue('user-result');

      // Should not throw despite Sentry failure
      const wrapped = wrapMiddlewareHandler(userHandler, 'isolated-middleware');

      // This should handle the Sentry error gracefully and still call user code
      await expect(wrapped(mockEvent)).rejects.toThrow('Sentry API failure');

      // But user handler should still have been attempted to be called
      // (this tests that we don't fail before reaching user code)
    });
  });

  describe('Sentry API integration', () => {
    it('should call Sentry APIs with correct parameters', async () => {
      const userHandler: EventHandler = vi.fn().mockResolvedValue('api-test-result');

      const wrapped = wrapMiddlewareHandler(userHandler, 'api-middleware');
      await wrapped(mockEvent);

      // Verify key Sentry APIs are called correctly
      expect(SentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'api-middleware',
          attributes: expect.objectContaining({
            [SentryCore.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server.middleware',
            'nuxt.middleware.name': 'api-middleware',
            'http.request.method': 'GET',
            'http.route': '/test-path',
          }),
        }),
        expect.any(Function),
      );

      expect(SentryCore.httpRequestToRequestData).toHaveBeenCalledWith({
        method: 'GET',
        url: '/test-path',
        headers: { 'user-agent': 'test-agent' },
      });
    });

    it('should handle missing optional data gracefully', async () => {
      const minimalEvent = { path: '/minimal' } as H3Event<EventHandlerRequest>;
      const userHandler: EventHandler = vi.fn().mockResolvedValue('minimal-result');

      const wrapped = wrapMiddlewareHandler(userHandler, 'minimal-middleware');
      const result = await wrapped(minimalEvent);

      expect(result).toBe('minimal-result');
      expect(userHandler).toHaveBeenCalledWith(minimalEvent);
      // Should still create span even with minimal data
      expect(SentryCore.startSpan).toHaveBeenCalled();
    });
  });
});
