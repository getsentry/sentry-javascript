import { RPCType } from '@opentelemetry/core';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  flush,
  getActiveSpan,
  getRootSpan,
  getTraceMetaTags,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  vercelWaitUntil,
} from '@sentry/core';
import { PassThrough } from 'stream';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getMetaTagTransformer, wrapSentryHandleRequest } from '../../src/server/wrapSentryHandleRequest';

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
  flush: vi.fn(),
  vercelWaitUntil: vi.fn(),
}));

describe('wrapSentryHandleRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should call flush on successful execution', async () => {
    const originalHandler = vi.fn().mockResolvedValue('success response');
    const wrappedHandler = wrapSentryHandleRequest(originalHandler);

    const request = new Request('https://example.com');
    const responseStatusCode = 200;
    const responseHeaders = new Headers();
    const routerContext = { staticHandlerContext: { matches: [] } } as any;
    const loadContext = {} as any;

    await wrappedHandler(request, responseStatusCode, responseHeaders, routerContext, loadContext);

    expect(vercelWaitUntil).toHaveBeenCalledWith(flush());
    expect(flush).toHaveBeenCalled();
  });

  test('should call flush even when original handler throws an error', async () => {
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

    expect(vercelWaitUntil).toHaveBeenCalledWith(flush());
    expect(flush).toHaveBeenCalled();
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
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react-router.request-handler',
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
});

describe('getMetaTagTransformer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getTraceMetaTags as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      '<meta name="sentry-trace" content="test-trace-id">',
    );
  });

  test('should inject meta tags before closing head tag', () => {
    const outputStream = new PassThrough();
    const bodyStream = new PassThrough();
    const transformer = getMetaTagTransformer(bodyStream);

    let outputData = '';
    outputStream.on('data', chunk => {
      outputData += chunk.toString();
    });

    outputStream.on('end', () => {
      expect(outputData).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
      expect(outputData).not.toContain('</head></head>');
    });

    transformer.pipe(outputStream);

    bodyStream.write('<html><head></head><body>Test</body></html>');
    bodyStream.end();
  });

  test('should not modify chunks without head closing tag', () => {
    const outputStream = new PassThrough();
    const bodyStream = new PassThrough();
    const transformer = getMetaTagTransformer(bodyStream);

    let outputData = '';
    outputStream.on('data', chunk => {
      outputData += chunk.toString();
    });

    outputStream.on('end', () => {
      expect(outputData).toBe('<html><body>Test</body></html>');
      expect(getTraceMetaTags).toHaveBeenCalled();
    });

    transformer.pipe(outputStream);

    bodyStream.write('<html><body>Test</body></html>');
    bodyStream.end();
  });

  test('should handle buffer input', () => {
    const outputStream = new PassThrough();
    const bodyStream = new PassThrough();
    const transformer = getMetaTagTransformer(bodyStream);

    let outputData = '';
    outputStream.on('data', chunk => {
      outputData += chunk.toString();
    });

    outputStream.on('end', () => {
      expect(outputData).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
    });

    transformer.pipe(outputStream);

    bodyStream.write(Buffer.from('<html><head></head><body>Test</body></html>'));
    bodyStream.end();
  });
});
