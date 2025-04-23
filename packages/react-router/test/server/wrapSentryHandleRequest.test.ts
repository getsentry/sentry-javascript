import { describe, test, expect, beforeEach, vi } from 'vitest';
import { RPCType } from '@opentelemetry/core';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, getActiveSpan, getRootSpan, getTraceMetaTags } from '@sentry/core';
import { PassThrough } from 'stream';
import { wrapSentryHandleRequest, getMetaTagTransformer } from '../../src/server/wrapSentryHandleRequest';

vi.mock('@opentelemetry/core', () => ({
  RPCType: { HTTP: 'http' },
  getRPCMetadata: vi.fn(),
}));

vi.mock('@sentry/core', () => ({
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE: 'sentry.source',
  getActiveSpan: vi.fn(),
  getRootSpan: vi.fn(),
  getTraceMetaTags: vi.fn(),
}));

describe('wrapSentryHandleRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const mockActiveSpan = { setAttribute: vi.fn() };
    const mockRootSpan = { setAttributes: vi.fn() };
    const mockRpcMetadata = { type: RPCType.HTTP, route: '/some-path' };

    (getActiveSpan as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockActiveSpan);
    (getRootSpan as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockRootSpan);
    const getRPCMetadata = vi.fn().mockReturnValue(mockRpcMetadata);
    vi.mocked(vi.importActual('@opentelemetry/core')).getRPCMetadata = getRPCMetadata;

    const routerContext = {
      staticHandlerContext: {
        matches: [{ route: { path: 'some-path' } }],
      },
    } as any;

    await wrappedHandler(new Request('https://nacho.queso'), 200, new Headers(), routerContext, {} as any);

    expect(getActiveSpan).toHaveBeenCalled();
    expect(getRootSpan).toHaveBeenCalledWith(mockActiveSpan);
    expect(mockRootSpan.setAttributes).toHaveBeenCalledWith({
      [ATTR_HTTP_ROUTE]: '/some-path',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
    });
    expect(mockRpcMetadata.route).toBe('/some-path');
  });

  test('should not set span attributes when parameterized path does not exist', async () => {
    const originalHandler = vi.fn().mockResolvedValue('test');
    const wrappedHandler = wrapSentryHandleRequest(originalHandler);

    const routerContext = {
      staticHandlerContext: {
        matches: [],
      },
    } as any;

    await wrappedHandler(new Request('https://guapo.chulo'), 200, new Headers(), routerContext, {} as any);

    expect(getActiveSpan).not.toHaveBeenCalled();
  });

  test('should not set span attributes when active span does not exist', async () => {
    const originalHandler = vi.fn().mockResolvedValue('test');
    const wrappedHandler = wrapSentryHandleRequest(originalHandler);

    (getActiveSpan as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const routerContext = {
      staticHandlerContext: {
        matches: [{ route: { path: 'some-path' } }],
      },
    } as any;

    await wrappedHandler(new Request('https://tio.pepe'), 200, new Headers(), routerContext, {} as any);

    expect(getActiveSpan).toHaveBeenCalled();
    expect(getRootSpan).not.toHaveBeenCalled();
  });
});

describe('getMetaTagTransformer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getTraceMetaTags as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      '<meta name="sentry-trace" content="test-trace-id">',
    );
  });

  test('should inject meta tags before closing head tag', done => {
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
      done();
    });

    transformer.pipe(outputStream);

    bodyStream.write('<html><head></head><body>Test</body></html>');
    bodyStream.end();
  });

  test('should not modify chunks without head closing tag', done => {
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
      done();
    });

    transformer.pipe(outputStream);

    bodyStream.write('<html><body>Test</body></html>');
    bodyStream.end();
  });

  test('should handle buffer input', done => {
    const outputStream = new PassThrough();
    const bodyStream = new PassThrough();
    const transformer = getMetaTagTransformer(bodyStream);

    let outputData = '';
    outputStream.on('data', chunk => {
      outputData += chunk.toString();
    });

    outputStream.on('end', () => {
      expect(outputData).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
      done();
    });

    transformer.pipe(outputStream);

    bodyStream.write(Buffer.from('<html><head></head><body>Test</body></html>'));
    bodyStream.end();
  });
});
