import type { Span, SpanJSON } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactRouterInstrumentation } from '../../../src/server/instrumentation/reactRouter';
import * as Util from '../../../src/server/instrumentation/util';
import * as ServerBuild from '../../../src/server/serverBuild';
import * as ServerGlobals from '../../../src/server/serverGlobals';

vi.mock('@sentry/core', async () => {
  return {
    getActiveSpan: vi.fn(),
    getRootSpan: vi.fn(),
    spanToJSON: vi.fn(),
    updateSpanName: vi.fn(),
    debug: {
      log: vi.fn(),
    },
    SDK_VERSION: '1.0.0',
    SEMANTIC_ATTRIBUTE_SENTRY_OP: 'sentry.op',
    SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'sentry.origin',
    SEMANTIC_ATTRIBUTE_SENTRY_SOURCE: 'sentry.source',
    startSpan: vi.fn((opts, fn) => fn({})),
    GLOBAL_OBJ: {},
  };
});

vi.mock('./util', async () => {
  return {
    getSpanName: vi.fn((pathname: string, method: string) => `span:${pathname}:${method}`),
    isDataRequest: vi.fn(),
  };
});

const mockSpan = {
  spanContext: () => ({ traceId: '1', spanId: '2', traceFlags: 1 }),
  setAttributes: vi.fn(),
};

function createRequest(url: string, method = 'GET') {
  return { url, method } as unknown as Request;
}

describe('ReactRouterInstrumentation', () => {
  let instrumentation: ReactRouterInstrumentation;
  let mockModule: any;
  let originalHandler: any;

  beforeEach(() => {
    instrumentation = new ReactRouterInstrumentation();
    originalHandler = vi.fn();
    mockModule = {
      createRequestHandler: vi.fn(() => originalHandler),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should patch createRequestHandler', () => {
    const proxy = (instrumentation as any)._createPatchedModuleProxy(mockModule);
    expect(typeof proxy.createRequestHandler).toBe('function');
    expect(proxy.createRequestHandler).not.toBe(mockModule.createRequestHandler);
  });

  it('should call original handler for non-data requests', async () => {
    vi.spyOn(Util, 'isDataRequest').mockReturnValue(false);

    const proxy = (instrumentation as any)._createPatchedModuleProxy(mockModule);
    const wrappedHandler = proxy.createRequestHandler();
    const req = createRequest('https://test.com/page');
    await wrappedHandler(req);

    expect(Util.isDataRequest).toHaveBeenCalledWith('/page');
    expect(originalHandler).toHaveBeenCalledWith(req, undefined);
  });

  it('should call original handler if no active root span', async () => {
    vi.spyOn(Util, 'isDataRequest').mockReturnValue(true);
    vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue(undefined);

    const proxy = (instrumentation as any)._createPatchedModuleProxy(mockModule);
    const wrappedHandler = proxy.createRequestHandler();
    const req = createRequest('https://test.com/data');
    await wrappedHandler(req);

    expect(SentryCore.debug.log).toHaveBeenCalledWith('No active root span found, skipping tracing for data request');
    expect(originalHandler).toHaveBeenCalledWith(req, undefined);
  });

  it('should start a span for data requests with active root span', async () => {
    vi.spyOn(Util, 'isDataRequest').mockReturnValue(true);
    // @ts-expect-error MockSpan just for testing
    vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue(mockSpan as Span);
    // @ts-expect-error MockSpan just for testing
    vi.spyOn(SentryCore, 'getRootSpan').mockReturnValue(mockSpan as Span);
    vi.spyOn(SentryCore, 'spanToJSON').mockReturnValue({ data: {} } as SpanJSON);
    vi.spyOn(Util, 'getSpanName').mockImplementation((pathname, method) => `span:${pathname}:${method}`);
    // @ts-expect-error MockSpan just for testing
    vi.spyOn(SentryCore, 'startSpan').mockImplementation((_opts, fn) => fn(mockSpan as Span));

    const proxy = (instrumentation as any)._createPatchedModuleProxy(mockModule);
    const wrappedHandler = proxy.createRequestHandler();
    const req = createRequest('https://test.com/data', 'POST');
    await wrappedHandler(req);

    expect(Util.isDataRequest).toHaveBeenCalledWith('/data');
    expect(Util.getSpanName).toHaveBeenCalledWith('/data', 'POST');
    expect(SentryCore.startSpan).toHaveBeenCalled();
    expect(originalHandler).toHaveBeenCalledWith(req, undefined);
  });

  it('should handle invalid URLs gracefully', async () => {
    const proxy = (instrumentation as any)._createPatchedModuleProxy(mockModule);
    const wrappedHandler = proxy.createRequestHandler();
    const req = { url: 'not a url', method: 'GET' } as any;
    await wrappedHandler(req);

    expect(originalHandler).toHaveBeenCalledWith(req, undefined);
  });

  it('should call setServerBuild when static ServerBuild is passed', () => {
    const spy = vi.spyOn(ServerBuild, 'setServerBuild');
    vi.spyOn(ServerBuild, 'isServerBuildLike').mockReturnValue(true);

    const staticBuild = { routes: { root: { id: 'root' } } };
    const proxy = (instrumentation as any)._createPatchedModuleProxy(mockModule);
    proxy.createRequestHandler(staticBuild);

    expect(spy).toHaveBeenCalledWith(staticBuild);
  });

  it('should capture ServerBuild from factory function', async () => {
    const resolvedBuild = { routes: { root: { id: 'root' } } };
    const buildFactory = vi.fn().mockResolvedValue(resolvedBuild);
    vi.spyOn(ServerBuild, 'isServerBuildLike').mockImplementation(val => val === resolvedBuild);
    const spy = vi.spyOn(ServerBuild, 'setServerBuild');

    const proxy = (instrumentation as any)._createPatchedModuleProxy(mockModule);
    proxy.createRequestHandler(buildFactory);

    // Factory gets wrapped — invoke it via the arg passed to the original createRequestHandler
    const wrappedFactory = mockModule.createRequestHandler.mock.calls[0][0];
    await wrappedFactory();

    expect(spy).toHaveBeenCalledWith(resolvedBuild);
  });

  it('should return original handler without wrapping when instrumentation API is active', () => {
    vi.spyOn(ServerGlobals, 'isInstrumentationApiUsed').mockReturnValue(true);

    const proxy = (instrumentation as any)._createPatchedModuleProxy(mockModule);
    const handler = proxy.createRequestHandler();

    expect(handler).toBe(originalHandler);
  });
});
