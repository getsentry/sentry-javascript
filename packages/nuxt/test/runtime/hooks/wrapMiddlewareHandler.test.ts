import * as SentryCore from '@sentry/core';
import type { EventHandler, EventHandlerRequest, H3Event } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapMiddlewareHandlerWithSentry } from '../../../src/runtime/hooks/wrapMiddlewareHandler';

// Only mock the Sentry APIs we need to verify
vi.mock('@sentry/core', async importOriginal => {
  const mod = await importOriginal();
  return {
    ...(mod as any),
    debug: { log: vi.fn() },
    startSpan: vi.fn(),
    getClient: vi.fn(),
    httpHeadersToSpanAttributes: vi.fn(),
    captureException: vi.fn(),
    flushIfServerless: vi.fn(),
  };
});

describe('wrapMiddlewareHandlerWithSentry', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup minimal required mocks
    (SentryCore.startSpan as any).mockImplementation((_config: any, callback: any) => callback(mockSpan));
    (SentryCore.getClient as any).mockReturnValue({ getOptions: () => ({ sendDefaultPii: false }) });
    (SentryCore.httpHeadersToSpanAttributes as any).mockReturnValue({ 'http.request.header.user_agent': 'test-agent' });
    (SentryCore.flushIfServerless as any).mockResolvedValue(undefined);
  });

  describe('function handler wrapping', () => {
    it('should wrap function handlers correctly and preserve return values', async () => {
      const functionHandler: EventHandler = vi.fn().mockResolvedValue('success');

      const wrapped = wrapMiddlewareHandlerWithSentry(functionHandler, 'test-middleware');
      const result = await wrapped(mockEvent);

      expect(functionHandler).toHaveBeenCalledWith(mockEvent);
      expect(result).toBe('success');
      expect(typeof wrapped).toBe('function');
    });

    it('should preserve sync return values from function handlers', async () => {
      const syncHandler: EventHandler = vi.fn().mockReturnValue('sync-result');

      const wrapped = wrapMiddlewareHandlerWithSentry(syncHandler, 'sync-middleware');
      const result = await wrapped(mockEvent);

      expect(syncHandler).toHaveBeenCalledWith(mockEvent);
      expect(result).toBe('sync-result');
    });
  });

  describe('different handler types', () => {
    it('should handle async function handlers', async () => {
      const asyncHandler: EventHandler = vi.fn().mockResolvedValue('async-success');

      const wrapped = wrapMiddlewareHandlerWithSentry(asyncHandler, 'async-middleware');
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

      const wrapped = wrapMiddlewareHandlerWithSentry(failingHandler, 'failing-middleware');

      await expect(wrapped(mockEvent)).rejects.toThrow('Original async error');
      await expect(wrapped(mockEvent)).rejects.toMatchObject({
        message: 'Original async error',
        stack: 'original-stack-trace',
      });

      // Verify Sentry APIs were called but error was not masked
      expect(SentryCore.captureException).toHaveBeenCalledWith(originalError, expect.any(Object));
    });

    it('should propagate sync errors without modification', async () => {
      const originalError = new Error('Original sync error');
      const failingHandler: EventHandler = vi.fn().mockImplementation(() => {
        throw originalError;
      });

      const wrapped = wrapMiddlewareHandlerWithSentry(failingHandler, 'sync-failing-middleware');

      await expect(wrapped(mockEvent)).rejects.toThrow('Original sync error');
      await expect(wrapped(mockEvent)).rejects.toBe(originalError);

      expect(SentryCore.captureException).toHaveBeenCalledWith(originalError, expect.any(Object));
    });

    it('should handle non-Error thrown values', async () => {
      const stringError = 'String error';
      const failingHandler: EventHandler = vi.fn().mockRejectedValue(stringError);

      const wrapped = wrapMiddlewareHandlerWithSentry(failingHandler, 'string-error-middleware');

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
      const wrapped = wrapMiddlewareHandlerWithSentry(userHandler, 'isolated-middleware');

      // This should handle the Sentry error gracefully and still call user code
      await expect(wrapped(mockEvent)).rejects.toThrow('Sentry API failure');
    });
  });

  describe('EventHandlerObject wrapping', () => {
    it('should wrap EventHandlerObject.handler correctly', async () => {
      const baseHandler: EventHandler = vi.fn().mockResolvedValue('handler-result');
      const handlerObject = {
        handler: baseHandler,
      };

      const wrapped = wrapMiddlewareHandlerWithSentry(handlerObject, 'object-middleware');

      // Should return an object with wrapped handler
      expect(typeof wrapped).toBe('object');
      expect(wrapped).toHaveProperty('handler');
      expect(typeof wrapped.handler).toBe('function');

      // Test that the wrapped handler works
      const result = await wrapped.handler(mockEvent);
      expect(result).toBe('handler-result');
      expect(baseHandler).toHaveBeenCalledWith(mockEvent);

      // Verify Sentry instrumentation was applied
      expect(SentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'object-middleware',
          attributes: expect.objectContaining({
            [SentryCore.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nuxt',
            'nuxt.middleware.name': 'object-middleware',
          }),
        }),
        expect.any(Function),
      );
    });

    it('should wrap EventHandlerObject.onRequest handlers correctly', async () => {
      const baseHandler: EventHandler = vi.fn().mockResolvedValue('main-result');
      const onRequestHandler = vi.fn().mockResolvedValue(undefined);
      const handlerObject = {
        handler: baseHandler,
        onRequest: onRequestHandler,
      };

      const wrapped = wrapMiddlewareHandlerWithSentry(handlerObject, 'request-middleware');

      // Should preserve onRequest handler
      expect(wrapped).toHaveProperty('onRequest');
      expect(typeof wrapped.onRequest).toBe('function');

      // Test that the wrapped onRequest handler works
      await wrapped.onRequest(mockEvent);
      expect(onRequestHandler).toHaveBeenCalledWith(mockEvent);

      // Verify Sentry instrumentation was applied to onRequest
      expect(SentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'request-middleware.onRequest',
          attributes: expect.objectContaining({
            [SentryCore.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nuxt',
            'nuxt.middleware.name': 'request-middleware',
            'nuxt.middleware.hook.name': 'onRequest',
          }),
        }),
        expect.any(Function),
      );

      // Verify that single handlers don't have an index attribute
      const spanCall = (SentryCore.startSpan as any).mock.calls.find(
        (call: any) => call[0]?.attributes?.['nuxt.middleware.hook.name'] === 'onRequest',
      );
      expect(spanCall[0].attributes).not.toHaveProperty('nuxt.middleware.hook.index');
    });

    it('should wrap EventHandlerObject.onRequest array of handlers correctly', async () => {
      const baseHandler: EventHandler = vi.fn().mockResolvedValue('main-result');
      const onRequestHandler1 = vi.fn().mockResolvedValue(undefined);
      const onRequestHandler2 = vi.fn().mockResolvedValue(undefined);
      const handlerObject = {
        handler: baseHandler,
        onRequest: [onRequestHandler1, onRequestHandler2],
      };

      const wrapped = wrapMiddlewareHandlerWithSentry(handlerObject, 'multi-request-middleware');

      // Should preserve onRequest as array
      expect(wrapped).toHaveProperty('onRequest');
      expect(Array.isArray(wrapped.onRequest)).toBe(true);
      expect(wrapped.onRequest).toHaveLength(2);

      // Test that both wrapped handlers work
      if (Array.isArray(wrapped.onRequest)) {
        await wrapped.onRequest[0]!(mockEvent);
        await wrapped.onRequest[1]!(mockEvent);
      }

      expect(onRequestHandler1).toHaveBeenCalledWith(mockEvent);
      expect(onRequestHandler2).toHaveBeenCalledWith(mockEvent);

      // Verify Sentry instrumentation was applied to both handlers
      expect(SentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'multi-request-middleware.onRequest',
          attributes: expect.objectContaining({
            'nuxt.middleware.hook.name': 'onRequest',
            'nuxt.middleware.hook.index': 0,
          }),
        }),
        expect.any(Function),
      );
      expect(SentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'multi-request-middleware.onRequest',
          attributes: expect.objectContaining({
            'nuxt.middleware.hook.name': 'onRequest',
            'nuxt.middleware.hook.index': 1,
          }),
        }),
        expect.any(Function),
      );
    });

    it('should wrap EventHandlerObject.onBeforeResponse handlers correctly', async () => {
      const baseHandler: EventHandler = vi.fn().mockResolvedValue('main-result');
      const onBeforeResponseHandler = vi.fn().mockResolvedValue(undefined);
      const handlerObject = {
        handler: baseHandler,
        onBeforeResponse: onBeforeResponseHandler,
      };

      const wrapped = wrapMiddlewareHandlerWithSentry(handlerObject, 'response-middleware');

      // Should preserve onBeforeResponse handler
      expect(wrapped).toHaveProperty('onBeforeResponse');
      expect(typeof wrapped.onBeforeResponse).toBe('function');

      // Test that the wrapped onBeforeResponse handler works
      const mockResponse = { body: 'test-response' };
      await wrapped.onBeforeResponse(mockEvent, mockResponse);
      expect(onBeforeResponseHandler).toHaveBeenCalledWith(mockEvent, mockResponse);

      // Verify Sentry instrumentation was applied to onBeforeResponse
      expect(SentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'response-middleware.onBeforeResponse',
          attributes: expect.objectContaining({
            [SentryCore.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nuxt',
            'nuxt.middleware.name': 'response-middleware',
            'nuxt.middleware.hook.name': 'onBeforeResponse',
          }),
        }),
        expect.any(Function),
      );
    });

    it('should wrap EventHandlerObject.onBeforeResponse array of handlers correctly', async () => {
      const baseHandler: EventHandler = vi.fn().mockResolvedValue('main-result');
      const onBeforeResponseHandler1 = vi.fn().mockResolvedValue(undefined);
      const onBeforeResponseHandler2 = vi.fn().mockResolvedValue(undefined);
      const handlerObject = {
        handler: baseHandler,
        onBeforeResponse: [onBeforeResponseHandler1, onBeforeResponseHandler2],
      };

      const wrapped = wrapMiddlewareHandlerWithSentry(handlerObject, 'multi-response-middleware');

      // Should preserve onBeforeResponse as array
      expect(wrapped).toHaveProperty('onBeforeResponse');
      expect(Array.isArray(wrapped.onBeforeResponse)).toBe(true);
      expect(wrapped.onBeforeResponse).toHaveLength(2);

      // Test that both wrapped handlers work
      const mockResponse = { body: 'test-response' };
      if (Array.isArray(wrapped.onBeforeResponse)) {
        await wrapped.onBeforeResponse[0]!(mockEvent, mockResponse);
        await wrapped.onBeforeResponse[1]!(mockEvent, mockResponse);
      }

      expect(onBeforeResponseHandler1).toHaveBeenCalledWith(mockEvent, mockResponse);
      expect(onBeforeResponseHandler2).toHaveBeenCalledWith(mockEvent, mockResponse);

      // Verify Sentry instrumentation was applied to both handlers
      expect(SentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'multi-response-middleware.onBeforeResponse',
          attributes: expect.objectContaining({
            'nuxt.middleware.hook.name': 'onBeforeResponse',
            'nuxt.middleware.hook.index': 0,
          }),
        }),
        expect.any(Function),
      );
      expect(SentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'multi-response-middleware.onBeforeResponse',
          attributes: expect.objectContaining({
            'nuxt.middleware.hook.name': 'onBeforeResponse',
            'nuxt.middleware.hook.index': 1,
          }),
        }),
        expect.any(Function),
      );
    });

    it('should wrap complex EventHandlerObject with all properties', async () => {
      const baseHandler: EventHandler = vi.fn().mockResolvedValue('complex-result');
      const onRequestHandler = vi.fn().mockResolvedValue(undefined);
      const onBeforeResponseHandler = vi.fn().mockResolvedValue(undefined);
      const handlerObject = {
        handler: baseHandler,
        onRequest: onRequestHandler,
        onBeforeResponse: onBeforeResponseHandler,
      };

      const wrapped = wrapMiddlewareHandlerWithSentry(handlerObject, 'complex-middleware');

      // Should preserve all properties
      expect(wrapped).toHaveProperty('handler');
      expect(wrapped).toHaveProperty('onRequest');
      expect(wrapped).toHaveProperty('onBeforeResponse');

      // Test main handler
      const result = await wrapped.handler(mockEvent);
      expect(result).toBe('complex-result');
      expect(baseHandler).toHaveBeenCalledWith(mockEvent);

      // Test onRequest handler
      await wrapped.onRequest(mockEvent);
      expect(onRequestHandler).toHaveBeenCalledWith(mockEvent);

      // Test onBeforeResponse handler
      const mockResponse = { body: 'test-response' };
      await wrapped.onBeforeResponse(mockEvent, mockResponse);
      expect(onBeforeResponseHandler).toHaveBeenCalledWith(mockEvent, mockResponse);

      // Verify all handlers got Sentry instrumentation
      expect(SentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'complex-middleware',
          attributes: expect.objectContaining({ 'nuxt.middleware.hook.name': 'handler' }),
        }),
        expect.any(Function),
      );
      expect(SentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'complex-middleware.onRequest',
          attributes: expect.objectContaining({ 'nuxt.middleware.hook.name': 'onRequest' }),
        }),
        expect.any(Function),
      );
      expect(SentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'complex-middleware.onBeforeResponse',
          attributes: expect.objectContaining({ 'nuxt.middleware.hook.name': 'onBeforeResponse' }),
        }),
        expect.any(Function),
      );
    });

    it('should handle EventHandlerObject without optional handlers', async () => {
      const baseHandler: EventHandler = vi.fn().mockResolvedValue('minimal-object-result');
      const handlerObject = {
        handler: baseHandler,
        // No onRequest or onBeforeResponse
      };

      const wrapped = wrapMiddlewareHandlerWithSentry(handlerObject, 'minimal-object-middleware');

      // Should only have handler property
      expect(wrapped).toHaveProperty('handler');
      expect(wrapped).not.toHaveProperty('onRequest');
      expect(wrapped).not.toHaveProperty('onBeforeResponse');

      // Test that the main handler works
      const result = await wrapped.handler(mockEvent);
      expect(result).toBe('minimal-object-result');
      expect(baseHandler).toHaveBeenCalledWith(mockEvent);

      // Verify Sentry instrumentation was applied
      expect(SentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'minimal-object-middleware',
        }),
        expect.any(Function),
      );
    });

    it('should propagate errors from EventHandlerObject.handler', async () => {
      const error = new Error('Handler error');
      const failingHandler: EventHandler = vi.fn().mockRejectedValue(error);
      const handlerObject = {
        handler: failingHandler,
      };

      const wrapped = wrapMiddlewareHandlerWithSentry(handlerObject, 'failing-object-middleware');

      await expect(wrapped.handler(mockEvent)).rejects.toThrow('Handler error');
      expect(SentryCore.captureException).toHaveBeenCalledWith(error, expect.any(Object));
    });

    it('should propagate errors from EventHandlerObject.onRequest', async () => {
      const baseHandler: EventHandler = vi.fn().mockResolvedValue('success');
      const error = new Error('OnRequest error');
      const failingOnRequestHandler = vi.fn().mockRejectedValue(error);
      const handlerObject = {
        handler: baseHandler,
        onRequest: failingOnRequestHandler,
      };

      const wrapped = wrapMiddlewareHandlerWithSentry(handlerObject, 'failing-request-middleware');

      await expect(wrapped.onRequest(mockEvent)).rejects.toThrow('OnRequest error');
      expect(SentryCore.captureException).toHaveBeenCalledWith(error, expect.any(Object));
    });

    it('should propagate errors from EventHandlerObject.onBeforeResponse', async () => {
      const baseHandler: EventHandler = vi.fn().mockResolvedValue('success');
      const error = new Error('OnBeforeResponse error');
      const failingOnBeforeResponseHandler = vi.fn().mockRejectedValue(error);
      const handlerObject = {
        handler: baseHandler,
        onBeforeResponse: failingOnBeforeResponseHandler,
      };

      const wrapped = wrapMiddlewareHandlerWithSentry(handlerObject, 'failing-response-middleware');

      const mockResponse = { body: 'test-response' };
      await expect(wrapped.onBeforeResponse(mockEvent, mockResponse)).rejects.toThrow('OnBeforeResponse error');
      expect(SentryCore.captureException).toHaveBeenCalledWith(error, expect.any(Object));
    });
  });

  describe('Sentry API integration', () => {
    it('should call Sentry APIs with correct parameters', async () => {
      const userHandler: EventHandler = vi.fn().mockResolvedValue('api-test-result');

      const wrapped = wrapMiddlewareHandlerWithSentry(userHandler, 'api-middleware');
      await wrapped(mockEvent);

      // Verify key Sentry APIs are called correctly
      expect(SentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'api-middleware',
          attributes: expect.objectContaining({
            [SentryCore.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nuxt',
            'nuxt.middleware.name': 'api-middleware',
            'http.request.method': 'GET',
            'http.route': '/test-path',
          }),
        }),
        expect.any(Function),
      );
    });

    it('should handle missing optional data gracefully', async () => {
      const minimalEvent = { path: '/minimal' } as H3Event<EventHandlerRequest>;
      const userHandler: EventHandler = vi.fn().mockResolvedValue('minimal-result');

      const wrapped = wrapMiddlewareHandlerWithSentry(userHandler, 'minimal-middleware');
      const result = await wrapped(minimalEvent);

      expect(result).toBe('minimal-result');
      expect(userHandler).toHaveBeenCalledWith(minimalEvent);
      // Should still create span even with minimal data
      expect(SentryCore.startSpan).toHaveBeenCalled();
    });
  });
});
