import { PassThrough } from 'node:stream';
import { RPCType } from '@opentelemetry/core';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  flushIfServerless,
  getActiveSpan,
  getRootSpan,
  getTraceMetaTags,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getMetaTagTransformer } from '../../src/server/getMetaTagTransformer';
import { wrapSentryHandleRequest } from '../../src/server/wrapSentryHandleRequest';

vi.mock('@opentelemetry/core', () => ({
  RPCType: { HTTP: 'http' },
  getRPCMetadata: vi.fn(),
}));
vi.mock('@sentry/core', () => ({
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE: 'sentry.source',
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'sentry.origin',
  getActiveSpan: vi.fn(),
  getRootSpan: vi.fn(),
  getTraceMetaTags: vi.fn(),
  flushIfServerless: vi.fn(),
  updateSpanName: vi.fn(),
  getCurrentScope: vi.fn(() => ({ setTransactionName: vi.fn() })),
  GLOBAL_OBJ: globalThis,
}));

describe('wrapSentryHandleRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global flag for unstable instrumentation
    delete (globalThis as any).__sentryReactRouterServerInstrumentationUsed;
  });

  test('should call original handler with same parameters', async () => {
    const originalHandler = vi.fn().mockResolvedValue('original response');
    const wrappedHandler = wrapSentryHandleRequest(originalHandler);

    const request = new Request('https://taco.burrito');
    const responseStatusCode = 200;
    const responseHeaders = new Headers();
    const routerContext = { staticHandlerContext: { matches: [] } } as any;
    const loadContext = {} as any;

    const result = await wrappedHandler(request, responseStatusCode, responseHeaders, routerContext, loadContext);

    expect(originalHandler).toHaveBeenCalledWith(
      request,
      responseStatusCode,
      responseHeaders,
      routerContext,
      loadContext,
    );
    expect(result).toBe('original response');
  });

  test('should set span attributes when parameterized path exists and active span exists', async () => {
    const originalHandler = vi.fn().mockResolvedValue('test');
    const wrappedHandler = wrapSentryHandleRequest(originalHandler);

    const mockActiveSpan = {};
    const mockRootSpan = { setAttributes: vi.fn() };
    const mockRpcMetadata = { type: RPCType.HTTP, route: '/some-path' };

    (getActiveSpan as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockActiveSpan);
    (getRootSpan as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockRootSpan);
    const getRPCMetadata = vi.fn().mockReturnValue(mockRpcMetadata);
    (vi.importActual('@opentelemetry/core') as unknown as { getRPCMetadata: typeof getRPCMetadata }).getRPCMetadata =
      getRPCMetadata;

    const routerContext = {
      staticHandlerContext: {
        matches: [{ route: { path: 'some-path' } }],
      },
    } as any;

    await wrappedHandler(new Request('https://nacho.queso'), 200, new Headers(), routerContext, {} as any);

    expect(mockRootSpan.setAttributes).toHaveBeenCalledWith({
      [ATTR_HTTP_ROUTE]: '/some-path',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.request_handler',
    });
    expect(mockRpcMetadata.route).toBe('/some-path');
  });

  test('should not set span attributes when parameterized path does not exist', async () => {
    const mockActiveSpan = {};
    const mockRootSpan = { setAttributes: vi.fn() };

    (getActiveSpan as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockActiveSpan);
    (getRootSpan as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockRootSpan);

    const originalHandler = vi.fn().mockResolvedValue('test');
    const wrappedHandler = wrapSentryHandleRequest(originalHandler);

    const routerContext = {
      staticHandlerContext: {
        matches: [],
      },
    } as any;

    await wrappedHandler(new Request('https://guapo.chulo'), 200, new Headers(), routerContext, {} as any);

    expect(mockRootSpan.setAttributes).not.toHaveBeenCalled();
  });

  test('should not set span attributes when active span does not exist', async () => {
    const originalHandler = vi.fn().mockResolvedValue('test');
    const wrappedHandler = wrapSentryHandleRequest(originalHandler);

    const mockRpcMetadata = { type: RPCType.HTTP, route: '/some-path' };

    (getActiveSpan as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const getRPCMetadata = vi.fn().mockReturnValue(mockRpcMetadata);
    (vi.importActual('@opentelemetry/core') as unknown as { getRPCMetadata: typeof getRPCMetadata }).getRPCMetadata =
      getRPCMetadata;

    const routerContext = {
      staticHandlerContext: {
        matches: [{ route: { path: 'some-path' } }],
      },
    } as any;

    await wrappedHandler(new Request('https://tio.pepe'), 200, new Headers(), routerContext, {} as any);

    expect(getRPCMetadata).not.toHaveBeenCalled();
  });

  test('should call flushIfServerless on successful execution', async () => {
    const originalHandler = vi.fn().mockResolvedValue('success response');
    const wrappedHandler = wrapSentryHandleRequest(originalHandler);

    const request = new Request('https://example.com');
    const responseStatusCode = 200;
    const responseHeaders = new Headers();
    const routerContext = { staticHandlerContext: { matches: [] } } as any;
    const loadContext = {} as any;

    await wrappedHandler(request, responseStatusCode, responseHeaders, routerContext, loadContext);

    expect(flushIfServerless).toHaveBeenCalled();
  });

  test('should call flushIfServerless even when original handler throws an error', async () => {
    const mockError = new Error('Handler failed');
    const originalHandler = vi.fn().mockRejectedValue(mockError);
    const wrappedHandler = wrapSentryHandleRequest(originalHandler);

    const request = new Request('https://example.com');
    const responseStatusCode = 200;
    const responseHeaders = new Headers();
    const routerContext = { staticHandlerContext: { matches: [] } } as any;
    const loadContext = {} as any;

    await expect(
      wrappedHandler(request, responseStatusCode, responseHeaders, routerContext, loadContext),
    ).rejects.toThrow('Handler failed');

    expect(flushIfServerless).toHaveBeenCalled();
  });

  test('should propagate errors from original handler', async () => {
    const mockError = new Error('Test error');
    const originalHandler = vi.fn().mockRejectedValue(mockError);
    const wrappedHandler = wrapSentryHandleRequest(originalHandler);

    const request = new Request('https://example.com');
    const responseStatusCode = 500;
    const responseHeaders = new Headers();
    const routerContext = { staticHandlerContext: { matches: [] } } as any;
    const loadContext = {} as any;

    await expect(wrappedHandler(request, responseStatusCode, responseHeaders, routerContext, loadContext)).rejects.toBe(
      mockError,
    );
  });

  test('should set route attributes as fallback when instrumentation API is used (for lazy-only routes)', async () => {
    // Set the global flag indicating instrumentation API is in use
    (globalThis as any).__sentryReactRouterServerInstrumentationUsed = true;

    const originalHandler = vi.fn().mockResolvedValue('test');
    const wrappedHandler = wrapSentryHandleRequest(originalHandler);

    const mockActiveSpan = {};
    const mockRootSpan = { setAttributes: vi.fn() };
    const mockRpcMetadata = { type: RPCType.HTTP, route: '/some-path' };

    (getActiveSpan as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockActiveSpan);
    (getRootSpan as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockRootSpan);
    const getRPCMetadata = vi.fn().mockReturnValue(mockRpcMetadata);
    (vi.importActual('@opentelemetry/core') as unknown as { getRPCMetadata: typeof getRPCMetadata }).getRPCMetadata =
      getRPCMetadata;

    const routerContext = {
      staticHandlerContext: {
        matches: [{ route: { path: 'some-path' } }],
      },
    } as any;

    await wrappedHandler(new Request('https://nacho.queso'), 200, new Headers(), routerContext, {} as any);

    // Should set route attributes without origin (to preserve instrumentation_api origin)
    expect(mockRootSpan.setAttributes).toHaveBeenCalledWith({
      [ATTR_HTTP_ROUTE]: '/some-path',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
    });
    expect(mockRpcMetadata.route).toBe('/some-path');
  });
});

describe('getMetaTagTransformer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getTraceMetaTags as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      '<meta name="sentry-trace" content="test-trace-id">',
    );
  });

  test('should inject meta tags before closing head tag', () => {
    return new Promise<void>(resolve => {
      const bodyStream = new PassThrough();
      const transformer = getMetaTagTransformer(bodyStream);

      let outputData = '';
      bodyStream.on('data', chunk => {
        outputData += chunk.toString();
      });

      bodyStream.on('end', () => {
        expect(outputData).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
        expect(outputData).not.toContain('</head></head>');
        resolve();
      });

      transformer.write('<html><head></head><body>Test</body></html>');
      transformer.end();
    });
  });

  test('should not modify chunks without head closing tag', () => {
    return new Promise<void>(resolve => {
      const bodyStream = new PassThrough();
      const transformer = getMetaTagTransformer(bodyStream);

      let outputData = '';
      bodyStream.on('data', chunk => {
        outputData += chunk.toString();
      });

      bodyStream.on('end', () => {
        expect(outputData).toBe('<html><body>Test</body></html>');
        resolve();
      });

      transformer.write('<html><body>Test</body></html>');
      transformer.end();
    });
  });

  test('should handle buffer input', () => {
    return new Promise<void>(resolve => {
      const bodyStream = new PassThrough();
      const transformer = getMetaTagTransformer(bodyStream);

      let outputData = '';
      bodyStream.on('data', chunk => {
        outputData += chunk.toString();
      });

      bodyStream.on('end', () => {
        expect(outputData).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
        resolve();
      });

      transformer.write(Buffer.from('<html><head></head><body>Test</body></html>'));
      transformer.end();
    });
  });
});
