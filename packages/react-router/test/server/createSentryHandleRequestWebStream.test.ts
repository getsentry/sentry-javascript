import type * as SentryCoreServer from '@sentry/core/server';
import { _INTERNAL_safeUnref } from '@sentry/core/server';
import type { EntryContext } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSentryHandleRequestWebStream } from '../../src/server/createSentryHandleRequestWebStream';

vi.mock('@sentry/core/server', async importOriginal => ({
  ...(await importOriginal<typeof SentryCoreServer>()),
  _INTERNAL_safeUnref: vi.fn(timer => timer),
}));

vi.mock('../../src/server/wrapSentryHandleRequest', () => ({
  wrapSentryHandleRequest: vi.fn(fn => fn),
}));

vi.mock('../../src/server/injectTraceMetaTags', () => ({
  injectTraceMetaTags: vi.fn((body: ReadableStream) => body),
}));

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void };

function createDeferred(): Deferred {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createBody(allReady: Promise<void>): ReadableStream & { allReady: Promise<void> } {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('<html><head></head></html>'));
      controller.close();
    },
  });
  return Object.assign(stream, { allReady });
}

describe('createSentryHandleRequestWebStream', () => {
  const mockServerRouter = vi.fn();
  const mockRenderToReadableStream = vi.fn();

  const makeRequest = (
    userAgent: string | null = 'Mozilla/5.0',
    signal: AbortSignal = new AbortController().signal,
  ): Request =>
    ({
      url: 'https://sentry-example.com/test',
      signal,
      headers: {
        get: vi.fn((name: string) => (name === 'user-agent' ? userAgent : null)),
      },
    }) as unknown as Request;

  const makeRouterContext = (isSpaMode = false) => ({ isSpaMode }) as unknown as EntryContext;

  let headers: Headers;

  beforeEach(() => {
    vi.clearAllMocks();
    headers = new Headers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('awaits allReady for bots before resolving', async () => {
    const allReady = createDeferred();
    mockRenderToReadableStream.mockResolvedValue(createBody(allReady.promise));

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    let resolved = false;
    const promise = handleRequest(makeRequest('Googlebot/2.1'), 200, headers, makeRouterContext(), {}).then(res => {
      resolved = true;
      return res;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);

    allReady.resolve();
    await promise;
    expect(resolved).toBe(true);
  });

  it('awaits allReady in SPA mode before resolving', async () => {
    const allReady = createDeferred();
    mockRenderToReadableStream.mockResolvedValue(createBody(allReady.promise));

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    let resolved = false;
    const promise = handleRequest(makeRequest(), 200, headers, makeRouterContext(true), {}).then(res => {
      resolved = true;
      return res;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);

    allReady.resolve();
    await promise;
    expect(resolved).toBe(true);
  });

  it.each([
    ['a bot', makeRequest('Googlebot/2.1'), makeRouterContext()],
    ['SPA mode', makeRequest(), makeRouterContext(true)],
  ])('rejects when allReady rejects for %s', async (_name, request, routerContext) => {
    const allReady = createDeferred();
    mockRenderToReadableStream.mockResolvedValue(createBody(allReady.promise));

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    const promise = handleRequest(request, 200, headers, routerContext, {});
    const assertion = expect(promise).rejects.toThrow('fatal stream error');

    await vi.advanceTimersByTimeAsync(0);
    allReady.reject(new Error('fatal stream error'));

    await assertion;
  });

  it('resolves without waiting for allReady for regular browsers', async () => {
    const allReady = createDeferred();
    mockRenderToReadableStream.mockResolvedValue(createBody(allReady.promise));

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    const response = (await handleRequest(makeRequest(), 200, headers, makeRouterContext(), {})) as Response;
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
  });

  it('unrefs the abort timer so it cannot keep a Node process alive', async () => {
    mockRenderToReadableStream.mockResolvedValue(createBody(Promise.resolve()));

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    await handleRequest(makeRequest(), 200, headers, makeRouterContext(), {});

    expect(_INTERNAL_safeUnref).toHaveBeenCalledTimes(1);
  });

  it('aborts the signal after streamTimeout and clears the timer once allReady settles', async () => {
    const allReady = createDeferred();
    mockRenderToReadableStream.mockResolvedValue(createBody(allReady.promise));

    const handleRequest = createSentryHandleRequestWebStream({
      streamTimeout: 5000,
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    await handleRequest(makeRequest(), 200, headers, makeRouterContext(), {});

    const { signal } = mockRenderToReadableStream.mock.calls[0]![1] as { signal: AbortSignal };
    expect(signal.aborted).toBe(false);

    allReady.resolve();
    await allReady.promise;
    await vi.advanceTimersByTimeAsync(0);
    vi.advanceTimersByTime(5000);
    expect(signal.aborted).toBe(false);
  });

  it('aborts the signal once streamTimeout elapses before allReady', async () => {
    const allReady = createDeferred();
    mockRenderToReadableStream.mockResolvedValue(createBody(allReady.promise));

    const handleRequest = createSentryHandleRequestWebStream({
      streamTimeout: 5000,
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    await handleRequest(makeRequest(), 200, headers, makeRouterContext(), {});
    const { signal } = mockRenderToReadableStream.mock.calls[0]![1] as { signal: AbortSignal };

    vi.advanceTimersByTime(4999);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
  });

  it('aborts the render signal when the request is aborted mid-render', async () => {
    const requestController = new AbortController();
    mockRenderToReadableStream.mockResolvedValue(createBody(new Promise(() => {})));

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    await handleRequest(makeRequest('Mozilla/5.0', requestController.signal), 200, headers, makeRouterContext(), {});
    const { signal } = mockRenderToReadableStream.mock.calls[0]![1] as { signal: AbortSignal };
    expect(signal.aborted).toBe(false);

    requestController.abort(new Error('client disconnected'));

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toEqual(new Error('client disconnected'));
  });

  it('aborts the render signal immediately when the request is already aborted', async () => {
    const requestController = new AbortController();
    requestController.abort();
    mockRenderToReadableStream.mockResolvedValue(createBody(new Promise(() => {})));

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    await handleRequest(makeRequest('Mozilla/5.0', requestController.signal), 200, headers, makeRouterContext(), {});
    const { signal } = mockRenderToReadableStream.mock.calls[0]![1] as { signal: AbortSignal };

    expect(signal.aborted).toBe(true);
  });

  it('ignores a request abort once allReady has settled', async () => {
    const requestController = new AbortController();
    const allReady = createDeferred();
    mockRenderToReadableStream.mockResolvedValue(createBody(allReady.promise));

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    await handleRequest(makeRequest('Mozilla/5.0', requestController.signal), 200, headers, makeRouterContext(), {});
    const { signal } = mockRenderToReadableStream.mock.calls[0]![1] as { signal: AbortSignal };

    allReady.resolve();
    await allReady.promise;
    await vi.advanceTimersByTimeAsync(0);
    requestController.abort();

    expect(signal.aborted).toBe(false);
  });

  it('stops listening to the request signal when the render fails', async () => {
    const requestController = new AbortController();
    mockRenderToReadableStream.mockRejectedValue(new Error('Shell error'));

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    await expect(
      handleRequest(makeRequest('Mozilla/5.0', requestController.signal), 200, headers, makeRouterContext(), {}),
    ).rejects.toThrow('Shell error');
    const { signal } = mockRenderToReadableStream.mock.calls[0]![1] as { signal: AbortSignal };

    requestController.abort();

    expect(signal.aborted).toBe(false);
  });

  it('uses a 10000ms default stream timeout', async () => {
    mockRenderToReadableStream.mockResolvedValue(createBody(new Promise(() => {})));

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    await handleRequest(makeRequest(), 200, headers, makeRouterContext(), {});
    const { signal } = mockRenderToReadableStream.mock.calls[0]![1] as { signal: AbortSignal };

    vi.advanceTimersByTime(9999);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
  });

  it('sets status 500 when onError fires before the response', async () => {
    mockRenderToReadableStream.mockImplementation(async (_node, options) => {
      options.onError?.(new Error('late error'));
      return createBody(Promise.resolve());
    });

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    const response = (await handleRequest(
      makeRequest('Googlebot/2.1'),
      200,
      headers,
      makeRouterContext(),
      {},
    )) as Response;
    expect(response.status).toBe(500);
  });

  it('logs errors that fire after the shell has rendered', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('stream error');
    const allReady = createDeferred();

    mockRenderToReadableStream.mockImplementation(async (_node, options) => {
      const body = createBody(allReady.promise);
      setTimeout(() => options.onError?.(error), 0);
      return body;
    });

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    const promise = handleRequest(makeRequest(), 200, headers, makeRouterContext(), {});
    await vi.advanceTimersByTimeAsync(0);
    const response = (await promise) as Response;

    expect(consoleSpy).toHaveBeenCalledWith(error);
    expect(response.status).toBe(200);
    consoleSpy.mockRestore();
  });

  it('rejects when the shell fails to render', async () => {
    const testError = new Error('Shell error');
    mockRenderToReadableStream.mockRejectedValue(testError);

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    await expect(handleRequest(makeRequest(), 200, headers, makeRouterContext(), {})).rejects.toThrow(testError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes the nonce from getNonce to ServerRouter and renderToReadableStream', async () => {
    mockRenderToReadableStream.mockResolvedValue(createBody(Promise.resolve()));
    const getNonce = vi.fn().mockReturnValue('test-nonce');
    const request = makeRequest();
    const loadContext = {};

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
      getNonce,
    });

    await handleRequest(request, 200, headers, makeRouterContext(), loadContext);

    expect(getNonce).toHaveBeenCalledWith({ request, loadContext });
    expect(mockRenderToReadableStream).toHaveBeenCalledWith(
      expect.objectContaining({ props: expect.objectContaining({ nonce: 'test-nonce' }) }),
      expect.objectContaining({ nonce: 'test-nonce' }),
    );
  });

  it('uses a custom bot regex', async () => {
    const allReady = createDeferred();
    mockRenderToReadableStream.mockResolvedValue(createBody(allReady.promise));

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
      botRegex: /custom-bot/i,
    });

    let resolved = false;
    const promise = handleRequest(makeRequest('Googlebot/2.1'), 200, headers, makeRouterContext(), {}).then(res => {
      resolved = true;
      return res;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
    await promise;
  });

  it('sets Content-Type and passes the body through injectTraceMetaTags', async () => {
    const { injectTraceMetaTags } = await import('../../src/server/injectTraceMetaTags');
    const body = createBody(Promise.resolve());
    mockRenderToReadableStream.mockResolvedValue(body);

    const handleRequest = createSentryHandleRequestWebStream({
      renderToReadableStream: mockRenderToReadableStream,
      ServerRouter: mockServerRouter,
    });

    const response = (await handleRequest(makeRequest(), 200, headers, makeRouterContext(), {})) as Response;

    expect(headers.get('Content-Type')).toBe('text/html');
    expect(injectTraceMetaTags).toHaveBeenCalledWith(body);
    expect(response.headers.get('Content-Type')).toBe('text/html');
  });
});
