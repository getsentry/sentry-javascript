import { PassThrough } from 'node:stream';
import { RPCType } from '@opentelemetry/core';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  flushIfServerless,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  getTraceMetaTags,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  updateSpanName,
} from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getMetaTagTransformer } from '../../src/server/getMetaTagTransformer';
import { wrapSentryHandleRequest } from '../../src/server/wrapSentryHandleRequest';

vi.mock('@opentelemetry/core', () => ({
  RPCType: { HTTP: 'http' },
  getRPCMetadata: vi.fn(),
}));
vi.mock('@sentry/core', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    SEMANTIC_ATTRIBUTE_SENTRY_SOURCE: 'sentry.source',
    SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'sentry.origin',
    getActiveSpan: vi.fn(),
    getRootSpan: vi.fn(),
    getTraceMetaTags: vi.fn(),
    flushIfServerless: vi.fn(),
    updateSpanName: vi.fn(),
    getCurrentScope: vi.fn(() => ({ setTransactionName: vi.fn() })),
    GLOBAL_OBJ: globalThis,
  };
});

describe('wrapSentryHandleRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global flag for unstable instrumentation
    delete (globalThis as any).__sentryReactRouterServerInstrumentationUsed;
  });

  function setupManifestTest() {
    const originalHandler = vi.fn().mockResolvedValue('test');
    const wrappedHandler = wrapSentryHandleRequest(originalHandler);

    const mockActiveSpan = {};
    const mockRootSpan = { setAttributes: vi.fn() };
    const mockSetTransactionName = vi.fn();

    (getActiveSpan as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockActiveSpan);
    (getRootSpan as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockRootSpan);
    (getCurrentScope as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });

    return { wrappedHandler, mockRootSpan, mockSetTransactionName };
  }

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

  test('should use manifest routes when staticHandlerContext.matches is empty', async () => {
    const { wrappedHandler, mockRootSpan, mockSetTransactionName } = setupManifestTest();

    const routerContext = {
      staticHandlerContext: {
        matches: [],
      },
      manifest: {
        routes: {
          root: { path: undefined, parentId: undefined },
          'rsc-layout': { path: 'rsc', parentId: 'root' },
          'rsc-server-component': { path: 'server-component', parentId: 'rsc-layout' },
        },
      },
    } as any;

    await wrappedHandler(
      new Request('https://example.com/rsc/server-component'),
      200,
      new Headers(),
      routerContext,
      {} as any,
    );

    expect(updateSpanName).toHaveBeenCalledWith(mockRootSpan, 'GET /rsc/server-component');
    expect(mockSetTransactionName).toHaveBeenCalledWith('GET /rsc/server-component');
    expect(mockRootSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        [ATTR_HTTP_ROUTE]: '/rsc/server-component',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      }),
    );
  });

  test('should handle parameterized routes from manifest', async () => {
    const { wrappedHandler, mockRootSpan, mockSetTransactionName } = setupManifestTest();

    const routerContext = {
      staticHandlerContext: {
        matches: [],
      },
      manifest: {
        routes: {
          root: { path: undefined, parentId: undefined },
          performance: { path: 'performance', parentId: 'root' },
          'performance-param': { path: 'with/:param', parentId: 'performance' },
        },
      },
    } as any;

    await wrappedHandler(
      new Request('https://example.com/performance/with/some-param'),
      200,
      new Headers(),
      routerContext,
      {} as any,
    );

    expect(updateSpanName).toHaveBeenCalledWith(mockRootSpan, 'GET /performance/with/:param');
    expect(mockSetTransactionName).toHaveBeenCalledWith('GET /performance/with/:param');
  });

  test('should match routes with dots in path segments', async () => {
    const { wrappedHandler, mockRootSpan, mockSetTransactionName } = setupManifestTest();

    const routerContext = {
      staticHandlerContext: {
        matches: [],
      },
      manifest: {
        routes: {
          root: { path: undefined, parentId: undefined },
          'api-v1': { path: 'api', parentId: 'root' },
          'api-v1-users': { path: 'v1.0/users', parentId: 'api-v1' },
        },
      },
    } as any;

    // /api/v1.0/users should match (dot is literal)
    await wrappedHandler(
      new Request('https://example.com/api/v1.0/users'),
      200,
      new Headers(),
      routerContext,
      {} as any,
    );

    expect(updateSpanName).toHaveBeenCalledWith(mockRootSpan, 'GET /api/v1.0/users');
    expect(mockSetTransactionName).toHaveBeenCalledWith('GET /api/v1.0/users');

    vi.clearAllMocks();
    const { wrappedHandler: wrappedHandlerNoMatch } = setupManifestTest();

    // /api/v1X0/users should not match (would incorrectly match with unescaped .)
    await wrappedHandlerNoMatch(
      new Request('https://example.com/api/v1X0/users'),
      200,
      new Headers(),
      routerContext,
      {} as any,
    );

    expect(updateSpanName).not.toHaveBeenCalled();
  });

  test('should match manifest routes when URL has trailing slash', async () => {
    const { wrappedHandler, mockRootSpan, mockSetTransactionName } = setupManifestTest();

    const routerContext = {
      staticHandlerContext: {
        matches: [],
      },
      manifest: {
        routes: {
          root: { path: undefined, parentId: undefined },
          'rsc-layout': { path: 'rsc', parentId: 'root' },
          'rsc-server-component': { path: 'server-component', parentId: 'rsc-layout' },
        },
      },
    } as any;

    await wrappedHandler(
      new Request('https://example.com/rsc/server-component/'),
      200,
      new Headers(),
      routerContext,
      {} as any,
    );

    expect(updateSpanName).toHaveBeenCalledWith(mockRootSpan, 'GET /rsc/server-component');
    expect(mockSetTransactionName).toHaveBeenCalledWith('GET /rsc/server-component');
    expect(mockRootSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        [ATTR_HTTP_ROUTE]: '/rsc/server-component',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      }),
    );
  });

  test('should prefer staticHandlerContext.matches over manifest', async () => {
    const { wrappedHandler, mockRootSpan, mockSetTransactionName } = setupManifestTest();

    const routerContext = {
      staticHandlerContext: {
        matches: [{ route: { path: 'static-path' } }],
      },
      manifest: {
        routes: {
          root: { path: undefined, parentId: undefined },
          'manifest-route': { path: 'manifest-path', parentId: 'root' },
        },
      },
    } as any;

    await wrappedHandler(new Request('https://example.com/static-path'), 200, new Headers(), routerContext, {} as any);

    expect(updateSpanName).toHaveBeenCalledWith(mockRootSpan, 'GET /static-path');
    expect(mockSetTransactionName).toHaveBeenCalledWith('GET /static-path');
  });

  test('should not set attributes when manifest is missing', async () => {
    const { wrappedHandler, mockRootSpan } = setupManifestTest();

    const routerContext = {
      staticHandlerContext: {
        matches: [],
      },
    } as any;

    await wrappedHandler(new Request('https://example.com/some-path'), 200, new Headers(), routerContext, {} as any);

    expect(mockRootSpan.setAttributes).not.toHaveBeenCalled();
    expect(updateSpanName).not.toHaveBeenCalled();
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

  test('should prefer static route over parameterized route with similar path length', async () => {
    const { wrappedHandler, mockRootSpan, mockSetTransactionName } = setupManifestTest();

    const routerContext = {
      staticHandlerContext: {
        matches: [],
      },
      manifest: {
        routes: {
          root: { path: undefined, parentId: undefined },
          'api-name': { path: 'api/:name', parentId: 'root' },
          'api-users': { path: 'api/users', parentId: 'root' },
        },
      },
    } as any;

    await wrappedHandler(new Request('https://example.com/api/users'), 200, new Headers(), routerContext, {} as any);

    expect(updateSpanName).toHaveBeenCalledWith(mockRootSpan, 'GET /api/users');
    expect(mockSetTransactionName).toHaveBeenCalledWith('GET /api/users');
  });

  test('should match static route even when shorter than parameterized route', async () => {
    const { wrappedHandler, mockRootSpan, mockSetTransactionName } = setupManifestTest();

    const routerContext = {
      staticHandlerContext: {
        matches: [],
      },
      manifest: {
        routes: {
          root: { path: undefined, parentId: undefined },
          users: { path: 'users', parentId: 'root' },
          'users-id': { path: ':id', parentId: 'users' },
          'users-me': { path: 'me', parentId: 'users' },
        },
      },
    } as any;

    await wrappedHandler(new Request('https://example.com/users/me'), 200, new Headers(), routerContext, {} as any);

    expect(updateSpanName).toHaveBeenCalledWith(mockRootSpan, 'GET /users/me');
    expect(mockSetTransactionName).toHaveBeenCalledWith('GET /users/me');
  });

  test('should match wildcard catch-all route as least-specific fallback', async () => {
    const { wrappedHandler, mockRootSpan, mockSetTransactionName } = setupManifestTest();

    const routerContext = {
      staticHandlerContext: {
        matches: [],
      },
      manifest: {
        routes: {
          root: { path: undefined, parentId: undefined },
          about: { path: 'about', parentId: 'root' },
          catchall: { path: '*', parentId: 'root' },
        },
      },
    } as any;

    // /unknown should fall through to catch-all
    await wrappedHandler(
      new Request('https://example.com/unknown/deep/path'),
      200,
      new Headers(),
      routerContext,
      {} as any,
    );

    expect(updateSpanName).toHaveBeenCalledWith(mockRootSpan, 'GET /*');
    expect(mockSetTransactionName).toHaveBeenCalledWith('GET /*');
  });

  test('should match wildcard route with prefix', async () => {
    const { wrappedHandler, mockRootSpan, mockSetTransactionName } = setupManifestTest();

    const routerContext = {
      staticHandlerContext: {
        matches: [],
      },
      manifest: {
        routes: {
          root: { path: undefined, parentId: undefined },
          docs: { path: 'docs', parentId: 'root' },
          'docs-catchall': { path: '*', parentId: 'docs' },
        },
      },
    } as any;

    await wrappedHandler(
      new Request('https://example.com/docs/api/reference'),
      200,
      new Headers(),
      routerContext,
      {} as any,
    );

    expect(updateSpanName).toHaveBeenCalledWith(mockRootSpan, 'GET /docs/*');
    expect(mockSetTransactionName).toHaveBeenCalledWith('GET /docs/*');
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
