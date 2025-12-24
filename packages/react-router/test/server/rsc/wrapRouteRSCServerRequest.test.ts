import * as core from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteRSCServerRequestArgs, RouteRSCServerRequestFn } from '../../../src/server/rsc/types';
import { wrapRouteRSCServerRequest } from '../../../src/server/rsc/wrapRouteRSCServerRequest';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startSpan: vi.fn(),
    captureException: vi.fn(),
    getIsolationScope: vi.fn(),
    getActiveSpan: vi.fn(),
    getRootSpan: vi.fn(),
  };
});

describe('wrapRouteRSCServerRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockArgs = (): RouteRSCServerRequestArgs => ({
    request: new Request('http://test.com/users/123'),
    fetchServer: vi.fn().mockResolvedValue(new Response('server response')),
    createFromReadableStream: vi.fn().mockResolvedValue({ data: 'decoded' }),
    renderHTML: vi.fn().mockReturnValue(new ReadableStream()),
  });

  it('should wrap the original function and call it with modified args', async () => {
    const mockResponse = new Response('html');
    const mockOriginalFn: RouteRSCServerRequestFn = vi.fn().mockResolvedValue(mockResponse);
    const mockArgs = createMockArgs();
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: mockSetTransactionName });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn(), setAttributes: vi.fn() }));

    const wrappedFn = wrapRouteRSCServerRequest(mockOriginalFn);
    const result = await wrappedFn(mockArgs);

    expect(result).toBe(mockResponse);
    expect(mockOriginalFn).toHaveBeenCalledWith(
      expect.objectContaining({
        request: mockArgs.request,
      }),
    );
    expect(mockSetTransactionName).toHaveBeenCalledWith('RSC SSR GET /users/123');
  });

  it('should update root span attributes if active span exists', async () => {
    const mockOriginalFn: RouteRSCServerRequestFn = vi.fn().mockResolvedValue(new Response('html'));
    const mockArgs = createMockArgs();
    const mockSetTransactionName = vi.fn();
    const mockSetAttributes = vi.fn();
    const mockRootSpan = { setAttributes: mockSetAttributes };
    const mockActiveSpan = {};

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: mockSetTransactionName });
    (core.getActiveSpan as any).mockReturnValue(mockActiveSpan);
    (core.getRootSpan as any).mockReturnValue(mockRootSpan);
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn(), setAttributes: vi.fn() }));

    const wrappedFn = wrapRouteRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    expect(core.getRootSpan).toHaveBeenCalledWith(mockActiveSpan);
    expect(mockSetAttributes).toHaveBeenCalledWith({
      [core.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.rsc.ssr',
      'rsc.ssr_request': true,
    });
  });

  it('should wrap fetchServer with span and error capture', async () => {
    const mockServerResponse = new Response('server response');
    const mockFetchServer = vi.fn().mockResolvedValue(mockServerResponse);
    const mockArgs: RouteRSCServerRequestArgs = {
      ...createMockArgs(),
      fetchServer: mockFetchServer,
    };

    let capturedFetchServer: any;
    const mockOriginalFn: RouteRSCServerRequestFn = vi.fn().mockImplementation(async args => {
      capturedFetchServer = args.fetchServer;
      return new Response('html');
    });

    const startSpanCalls: any[] = [];
    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: vi.fn() });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((options: any, fn: any) => {
      startSpanCalls.push(options);
      return fn({ setStatus: vi.fn(), setAttributes: vi.fn() });
    });

    const wrappedFn = wrapRouteRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    // Call the wrapped fetchServer
    const fetchRequest = new Request('http://test.com/api');
    const result = await capturedFetchServer(fetchRequest);

    expect(result).toBe(mockServerResponse);
    expect(mockFetchServer).toHaveBeenCalledWith(fetchRequest);

    // Check that a span was created for fetchServer
    const fetchServerSpan = startSpanCalls.find(call => call.name === 'RSC Fetch Server');
    expect(fetchServerSpan).toBeDefined();
    expect(fetchServerSpan.attributes).toEqual(
      expect.objectContaining({
        [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client.rsc',
        [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.rsc.fetch',
      }),
    );
  });

  it('should capture errors from fetchServer', async () => {
    const mockError = new Error('fetchServer failed');
    const mockFetchServer = vi.fn().mockRejectedValue(mockError);
    const mockArgs: RouteRSCServerRequestArgs = {
      ...createMockArgs(),
      fetchServer: mockFetchServer,
    };

    let capturedFetchServer: any;
    const mockOriginalFn: RouteRSCServerRequestFn = vi.fn().mockImplementation(async args => {
      capturedFetchServer = args.fetchServer;
      return new Response('html');
    });

    const mockSetStatus = vi.fn();
    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: vi.fn() });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_: any, fn: any) =>
      fn({ setStatus: mockSetStatus, setAttributes: vi.fn() }),
    );

    const wrappedFn = wrapRouteRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    // Call the wrapped fetchServer and expect it to reject
    const fetchRequest = new Request('http://test.com/api');
    await expect(capturedFetchServer(fetchRequest)).rejects.toThrow('fetchServer failed');

    expect(mockSetStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });
    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: {
        type: 'instrument',
        handled: false,
        data: {
          function: 'fetchServer',
        },
      },
    });
  });

  it('should wrap renderHTML with span', async () => {
    const mockStream = new ReadableStream();
    const mockRenderHTML = vi.fn().mockResolvedValue(mockStream);
    const mockArgs: RouteRSCServerRequestArgs = {
      ...createMockArgs(),
      renderHTML: mockRenderHTML,
    };

    let capturedRenderHTML: any;
    const mockOriginalFn: RouteRSCServerRequestFn = vi.fn().mockImplementation(async args => {
      capturedRenderHTML = args.renderHTML;
      return new Response('html');
    });

    const startSpanCalls: any[] = [];
    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: vi.fn() });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((options: any, fn: any) => {
      startSpanCalls.push(options);
      return fn({ setStatus: vi.fn(), setAttributes: vi.fn() });
    });

    const wrappedFn = wrapRouteRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    // Call the wrapped renderHTML
    const getPayload = () => ({ formState: Promise.resolve(null) });
    const result = await capturedRenderHTML(getPayload);

    expect(result).toBe(mockStream);
    expect(mockRenderHTML).toHaveBeenCalledWith(getPayload);

    // Check that a span was created for renderHTML
    const renderHTMLSpan = startSpanCalls.find(call => call.name === 'RSC SSR Render HTML');
    expect(renderHTMLSpan).toBeDefined();
    expect(renderHTMLSpan.attributes).toEqual(
      expect.objectContaining({
        [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.rsc.ssr.render',
        [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.rsc.ssr',
      }),
    );
  });

  it('should capture errors from renderHTML', async () => {
    const mockError = new Error('renderHTML failed');
    const mockRenderHTML = vi.fn().mockRejectedValue(mockError);
    const mockArgs: RouteRSCServerRequestArgs = {
      ...createMockArgs(),
      renderHTML: mockRenderHTML,
    };

    let capturedRenderHTML: any;
    const mockOriginalFn: RouteRSCServerRequestFn = vi.fn().mockImplementation(async args => {
      capturedRenderHTML = args.renderHTML;
      return new Response('html');
    });

    const mockSetStatus = vi.fn();
    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: vi.fn() });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_: any, fn: any) =>
      fn({ setStatus: mockSetStatus, setAttributes: vi.fn() }),
    );

    const wrappedFn = wrapRouteRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    // Call the wrapped renderHTML and expect it to reject
    const getPayload = () => ({ formState: Promise.resolve(null) });
    await expect(capturedRenderHTML(getPayload)).rejects.toThrow('renderHTML failed');

    expect(mockSetStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });
    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: {
        type: 'instrument',
        handled: false,
        data: {
          function: 'renderHTML',
        },
      },
    });
  });

  it('should capture uncaptured exceptions from the original function', async () => {
    // Errors from fetchServer/renderHTML are captured in their wrappers and marked as captured.
    // The outer try-catch captures any errors not already marked, preventing blind spots
    // while avoiding double-capture.
    const mockError = new Error('Original function failed');
    const mockOriginalFn: RouteRSCServerRequestFn = vi.fn().mockRejectedValue(mockError);
    const mockArgs = createMockArgs();

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: vi.fn() });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn(), setAttributes: vi.fn() }));

    const wrappedFn = wrapRouteRSCServerRequest(mockOriginalFn);

    // Error should propagate
    await expect(wrappedFn(mockArgs)).rejects.toThrow('Original function failed');

    // Error is captured by outer try-catch since it wasn't already captured by inner wrappers
    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: {
        type: 'instrument',
        handled: false,
        data: {
          function: 'routeRSCServerRequest',
        },
      },
    });
  });

  it('should set response status code attribute on fetchServer span', async () => {
    const mockServerResponse = new Response('ok', { status: 200 });
    const mockFetchServer = vi.fn().mockResolvedValue(mockServerResponse);
    const mockArgs: RouteRSCServerRequestArgs = {
      ...createMockArgs(),
      fetchServer: mockFetchServer,
    };

    let capturedFetchServer: any;
    const mockOriginalFn: RouteRSCServerRequestFn = vi.fn().mockImplementation(async args => {
      capturedFetchServer = args.fetchServer;
      return new Response('html');
    });

    const mockSetAttributes = vi.fn();
    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: vi.fn() });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_: any, fn: any) =>
      fn({ setStatus: vi.fn(), setAttributes: mockSetAttributes }),
    );

    const wrappedFn = wrapRouteRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    // Call the wrapped fetchServer
    const fetchRequest = new Request('http://test.com/api');
    await capturedFetchServer(fetchRequest);

    expect(mockSetAttributes).toHaveBeenCalledWith({
      'http.response.status_code': 200,
    });
  });
});
