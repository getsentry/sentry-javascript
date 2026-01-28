/* eslint-disable no-console */
import type { EntryContext } from 'react-router';
import { PassThrough } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSentryHandleRequest } from '../../src/server/createSentryHandleRequest';
import * as getMetaTagTransformerModule from '../../src/server/getMetaTagTransformer';
import * as wrapSentryHandleRequestModule from '../../src/server/wrapSentryHandleRequest';

vi.mock('../../src/server/wrapSentryHandleRequest', () => ({
  wrapSentryHandleRequest: vi.fn(fn => fn),
}));

vi.mock('../../src/server/getMetaTagTransformer', () => ({
  getMetaTagTransformer: vi.fn(bodyStream => {
    const transformer = new PassThrough();
    bodyStream.pipe(transformer);
    return transformer;
  }),
}));

describe('createSentryHandleRequest', () => {
  const mockRenderToPipeableStream = vi.fn();
  const mockServerRouter = vi.fn();
  const mockCreateReadableStreamFromReadable = vi.fn();

  const mockRequest = {
    url: 'https://sentry-example.com/test',
    headers: {
      get: vi.fn(),
    },
  } as unknown as Request;

  let mockResponseHeaders: Headers;

  const mockRouterContext: EntryContext = {
    manifest: {
      entry: {
        imports: [],
        module: 'test-module',
      },
      routes: {},
      url: '/test',
      version: '1.0.0',
    },
    ssr: true,
    routeDiscovery: {
      mode: 'lazy',
      manifestPath: '/path/to/manifest',
    },
    routeModules: {},
    future: {
      unstable_subResourceIntegrity: false,
      v8_middleware: false,
      unstable_trailingSlashAwareDataRequests: false,
    },
    isSpaMode: false,
    staticHandlerContext: {
      matches: [
        {
          route: {
            path: 'test',
            id: 'test-route',
          },
          params: {},
          pathname: '/test',
          pathnameBase: '/test',
        },
      ],
      loaderData: {},
      actionData: null,
      errors: null,
      basename: '/',
      location: {
        pathname: '/test',
        search: '',
        hash: '',
        state: null,
        key: 'default',
      },
      statusCode: 200,
      loaderHeaders: {},
      actionHeaders: {},
    },
  };

  const mockLoadContext = {};

  const mockPipe = vi.fn();
  const mockAbort = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockResponseHeaders = new Headers();
    vi.spyOn(mockResponseHeaders, 'set');

    mockRenderToPipeableStream.mockReturnValue({
      pipe: mockPipe,
      abort: mockAbort,
    });

    mockCreateReadableStreamFromReadable.mockImplementation(body => body);

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a handleRequest function', () => {
    const handleRequest = createSentryHandleRequest({
      renderToPipeableStream: mockRenderToPipeableStream,
      ServerRouter: mockServerRouter,
      createReadableStreamFromReadable: mockCreateReadableStreamFromReadable,
    });

    expect(handleRequest).toBeDefined();
    expect(typeof handleRequest).toBe('function');
    expect(wrapSentryHandleRequestModule.wrapSentryHandleRequest).toHaveBeenCalled();
  });

  it('should use the default stream timeout if not provided', () => {
    const handleRequest = createSentryHandleRequest({
      renderToPipeableStream: mockRenderToPipeableStream,
      ServerRouter: mockServerRouter,
      createReadableStreamFromReadable: mockCreateReadableStreamFromReadable,
    });

    handleRequest(mockRequest, 200, mockResponseHeaders, mockRouterContext, mockLoadContext);

    vi.advanceTimersByTime(10000);
    expect(mockAbort).toHaveBeenCalled();
  });

  it('should use a custom stream timeout if provided', () => {
    const customTimeout = 5000;

    const handleRequest = createSentryHandleRequest({
      streamTimeout: customTimeout,
      renderToPipeableStream: mockRenderToPipeableStream,
      ServerRouter: mockServerRouter,
      createReadableStreamFromReadable: mockCreateReadableStreamFromReadable,
    });

    handleRequest(mockRequest, 200, mockResponseHeaders, mockRouterContext, mockLoadContext);

    vi.advanceTimersByTime(customTimeout - 1);
    expect(mockAbort).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mockAbort).toHaveBeenCalled();
  });

  it('should use the default bot regex if not provided', () => {
    const handleRequest = createSentryHandleRequest({
      renderToPipeableStream: mockRenderToPipeableStream,
      ServerRouter: mockServerRouter,
      createReadableStreamFromReadable: mockCreateReadableStreamFromReadable,
    });

    (mockRequest.headers.get as ReturnType<typeof vi.fn>).mockReturnValue('Googlebot/2.1');
    handleRequest(mockRequest, 200, mockResponseHeaders, mockRouterContext, mockLoadContext);

    expect(mockRenderToPipeableStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        onAllReady: expect.any(Function),
      }),
    );
  });

  it('should use a custom bot regex if provided', () => {
    const handleRequest = createSentryHandleRequest({
      renderToPipeableStream: mockRenderToPipeableStream,
      ServerRouter: mockServerRouter,
      createReadableStreamFromReadable: mockCreateReadableStreamFromReadable,
      botRegex: /custom-bot/i,
    });

    (mockRequest.headers.get as ReturnType<typeof vi.fn>).mockReturnValue('Googlebot/2.1');
    handleRequest(mockRequest, 200, mockResponseHeaders, mockRouterContext, mockLoadContext);

    expect(mockRenderToPipeableStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        onShellReady: expect.any(Function),
      }),
    );

    vi.clearAllMocks();
    (mockRequest.headers.get as ReturnType<typeof vi.fn>).mockReturnValue('custom-bot/1.0');
    handleRequest(mockRequest, 200, mockResponseHeaders, mockRouterContext, mockLoadContext);

    expect(mockRenderToPipeableStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        onAllReady: expect.any(Function),
      }),
    );
  });

  it('should use onAllReady for SPA mode', () => {
    const handleRequest = createSentryHandleRequest({
      renderToPipeableStream: mockRenderToPipeableStream,
      ServerRouter: mockServerRouter,
      createReadableStreamFromReadable: mockCreateReadableStreamFromReadable,
    });

    (mockRequest.headers.get as ReturnType<typeof vi.fn>).mockReturnValue('Mozilla/5.0');
    const spaRouterContext = { ...mockRouterContext, isSpaMode: true };

    handleRequest(mockRequest, 200, mockResponseHeaders, spaRouterContext, mockLoadContext);

    expect(mockRenderToPipeableStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        onAllReady: expect.any(Function),
      }),
    );
  });

  it('should use onShellReady for regular browsers', () => {
    const handleRequest = createSentryHandleRequest({
      renderToPipeableStream: mockRenderToPipeableStream,
      ServerRouter: mockServerRouter,
      createReadableStreamFromReadable: mockCreateReadableStreamFromReadable,
    });

    (mockRequest.headers.get as ReturnType<typeof vi.fn>).mockReturnValue('Mozilla/5.0');

    handleRequest(mockRequest, 200, mockResponseHeaders, mockRouterContext, mockLoadContext);

    expect(mockRenderToPipeableStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        onShellReady: expect.any(Function),
      }),
    );
  });

  it('should set Content-Type header when shell is ready', async () => {
    const handleRequest = createSentryHandleRequest({
      renderToPipeableStream: mockRenderToPipeableStream,
      ServerRouter: mockServerRouter,
      createReadableStreamFromReadable: mockCreateReadableStreamFromReadable,
    });

    mockRenderToPipeableStream.mockImplementation((jsx, options) => {
      if (options.onShellReady) {
        options.onShellReady();
      }
      return { pipe: mockPipe, abort: mockAbort };
    });

    await handleRequest(mockRequest, 200, mockResponseHeaders, mockRouterContext, mockLoadContext);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockResponseHeaders.set).toHaveBeenCalledWith('Content-Type', 'text/html');
  });

  it('should pipe to the meta tag transformer', async () => {
    const getMetaTagTransformerSpy = vi.spyOn(getMetaTagTransformerModule, 'getMetaTagTransformer');

    const pipeSpy = vi.fn();

    mockRenderToPipeableStream.mockImplementation((jsx, options) => {
      // Call the ready callback synchronously to trigger the code path we want to test
      setTimeout(() => {
        if (options.onShellReady) {
          options.onShellReady();
        }
      }, 0);

      return {
        pipe: pipeSpy,
        abort: mockAbort,
      };
    });

    const handleRequest = createSentryHandleRequest({
      renderToPipeableStream: mockRenderToPipeableStream,
      ServerRouter: mockServerRouter,
      createReadableStreamFromReadable: mockCreateReadableStreamFromReadable,
    });

    const promise = handleRequest(mockRequest, 200, mockResponseHeaders, mockRouterContext, mockLoadContext);

    // Advance timers to trigger the setTimeout in our mock
    await vi.runAllTimersAsync();
    await promise;

    expect(getMetaTagTransformerSpy).toHaveBeenCalled();
    expect(getMetaTagTransformerSpy.mock.calls[0]?.[0]).toBeInstanceOf(PassThrough);
    expect(pipeSpy).toHaveBeenCalled();
  });

  it('should set status code to 500 on error after shell is rendered', async () => {
    const handleRequest = createSentryHandleRequest({
      renderToPipeableStream: mockRenderToPipeableStream,
      ServerRouter: mockServerRouter,
      createReadableStreamFromReadable: mockCreateReadableStreamFromReadable,
    });

    const originalConsoleError = console.error;
    console.error = vi.fn();

    let shellReadyCallback: (() => void) | undefined;
    let errorCallback: ((error: Error) => void) | undefined;

    mockRenderToPipeableStream.mockImplementation((jsx, options) => {
      shellReadyCallback = options.onShellReady;
      errorCallback = options.onError;
      return { pipe: mockPipe, abort: mockAbort };
    });

    const responsePromise = handleRequest(mockRequest, 200, mockResponseHeaders, mockRouterContext, mockLoadContext);

    // First trigger shellReady to set shellRendered = true
    // Then trigger onError to cause the error handling
    if (shellReadyCallback) {
      shellReadyCallback();
    }

    if (errorCallback) {
      errorCallback(new Error('Test error'));
    }

    await responsePromise;
    expect(console.error).toHaveBeenCalled();
    console.error = originalConsoleError;
  });

  it('should reject the promise on shell error', async () => {
    const handleRequest = createSentryHandleRequest({
      renderToPipeableStream: mockRenderToPipeableStream,
      ServerRouter: mockServerRouter,
      createReadableStreamFromReadable: mockCreateReadableStreamFromReadable,
    });

    const testError = new Error('Shell error');

    mockRenderToPipeableStream.mockImplementation((jsx, options) => {
      if (options.onShellError) {
        options.onShellError(testError);
      }
      return { pipe: mockPipe, abort: mockAbort };
    });

    await expect(
      handleRequest(mockRequest, 200, mockResponseHeaders, mockRouterContext, mockLoadContext),
    ).rejects.toThrow(testError);
  });
});
