import { HTTP_ROUTE, SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import * as SentryCore from '@sentry/core';
import { createHonoRequestMiddleware } from '@sentry/server-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// These exercise the request/response handlers via the public `createHonoRequestMiddleware`, which
// runs `requestHandler` on the way in and `responseHandler` on the way out of `next()`.

const mockSetTransactionName = vi.fn();
const mockSetSDKProcessingMetadata = vi.fn();
const mockSetUser = vi.fn();
const mockGetUser = vi.fn<() => Record<string, unknown>>(() => ({}));

let rootSpanAttributes: Record<string, unknown> = {};
const mockRootSpan = {
  setAttribute: vi.fn((key: string, value: unknown) => {
    rootSpanAttributes[key] = value;
  }),
  setAttributes: vi.fn((attributes: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(attributes)) {
      rootSpanAttributes[key] = value;
    }
  }),
  updateName: vi.fn(),
};

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    getActiveSpan: vi.fn(() => null),
    getRootSpan: vi.fn(() => mockRootSpan),
    getIsolationScope: vi.fn(() => ({
      setTransactionName: mockSetTransactionName,
      setSDKProcessingMetadata: mockSetSDKProcessingMetadata,
      setUser: mockSetUser,
      getUser: mockGetUser,
    })),
    getClient: vi.fn(() => undefined),
    captureException: vi.fn(),
  };
});

const getClientMock = SentryCore.getClient as ReturnType<typeof vi.fn>;
const captureExceptionMock = SentryCore.captureException as ReturnType<typeof vi.fn>;
const getActiveSpanMock = SentryCore.getActiveSpan as ReturnType<typeof vi.fn>;

// `event` throws on access so `hasFetchEvent` reports `false` (the Node/Bun/Deno path), which makes
// the request handler read request data from `req.raw` rather than a Cloudflare fetch event.
function createMockContext(status: number, error?: Error): unknown {
  return {
    req: {
      method: 'GET',
      routeIndex: 0,
      // `resolveRouteName` reads the matched routes straight off the request.
      matchedRoutes: [{ basePath: '/', path: '/test', method: 'GET', handler: (_c: unknown) => undefined }],
      raw: new Request('http://localhost/test'),
    },
    get event(): never {
      throw new Error('no fetch event');
    },
    res: { status },
    error,
  };
}

const noop = async (): Promise<void> => {};

// oxlint-disable-next-line typescript/no-explicit-any
async function runMiddleware(context: unknown, options: Record<string, any> = {}): Promise<void> {
  const middleware = createHonoRequestMiddleware(options);
  // oxlint-disable-next-line typescript/no-explicit-any
  await middleware(context as any, noop);
}

describe('responseHandler (via createHonoRequestMiddleware)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('error capture — default behavior (no shouldHandleError)', () => {
    it('captures error when context.error is set', async () => {
      const error = new Error('server error');
      await runMiddleware(createMockContext(500, error));

      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    });

    it('captures plain Error with no status (not an HTTPException) regardless of response status', async () => {
      const error = new Error('plain error, no status property');
      await runMiddleware(createMockContext(404, error));

      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    });

    it('does not call captureException when there is no error', async () => {
      await runMiddleware(createMockContext(200));

      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('delegates deduplication to the public capture API', async () => {
      const error = new Error('already captured');
      Object.defineProperty(error, '__sentry_captured__', { value: true, writable: false });

      await runMiddleware(createMockContext(500, error));

      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    });

    it('does not capture 4xx HTTPException (status on error object)', async () => {
      const error = Object.assign(new Error('Not Found'), { status: 404 });
      await runMiddleware(createMockContext(404, error));

      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('does not capture 3xx HTTPException (status on error object)', async () => {
      const error = Object.assign(new Error('Redirect'), { status: 301 });
      await runMiddleware(createMockContext(301, error));

      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('captures 5xx HTTPException (status on error object)', async () => {
      const error = Object.assign(new Error('Service Unavailable'), { status: 503 });
      await runMiddleware(createMockContext(503, error));

      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    });
  });

  describe('error capture — custom shouldHandleError', () => {
    it('calls shouldHandleError with the error and captures when it returns true', async () => {
      const shouldHandleError = vi.fn().mockReturnValue(true);
      const error = Object.assign(new Error('Not Found'), { status: 404 });

      await runMiddleware(createMockContext(404, error), { shouldHandleError });

      expect(shouldHandleError).toHaveBeenCalledWith(error);
      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    });

    it('does not capture when shouldHandleError returns false', async () => {
      const shouldHandleError = vi.fn().mockReturnValue(false);
      const error = new Error('suppressed 500 error');

      await runMiddleware(createMockContext(500, error), { shouldHandleError });

      expect(shouldHandleError).toHaveBeenCalledWith(error);
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('captures 4xx error that would normally be skipped when shouldHandleError returns true', async () => {
      const error = Object.assign(new Error('Unauthorized'), { status: 401 });
      await runMiddleware(createMockContext(401, error), { shouldHandleError: () => true });

      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    });

    it('suppresses 5xx error when shouldHandleError returns false', async () => {
      const error = Object.assign(new Error('Internal Server Error'), { status: 500 });
      await runMiddleware(createMockContext(500, error), { shouldHandleError: () => false });

      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('does not invoke shouldHandleError when context.error is absent', async () => {
      const shouldHandleError = vi.fn().mockReturnValue(true);
      await runMiddleware(createMockContext(200), { shouldHandleError });

      expect(shouldHandleError).not.toHaveBeenCalled();
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });
  });

  describe('transaction name', () => {
    it('sets transaction name on isolation scope', async () => {
      await runMiddleware(createMockContext(200));

      expect(mockSetTransactionName).toHaveBeenCalledWith('GET /test');
    });

    it('sets http.route and segment name source on the root span', async () => {
      getActiveSpanMock.mockReturnValue(mockRootSpan);

      await runMiddleware(createMockContext(200));

      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(HTTP_ROUTE, '/test');
      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(SENTRY_SEGMENT_NAME_SOURCE, 'route');
    });
  });
});

describe('requestHandler — connection info (via createHonoRequestMiddleware)', () => {
  const activeSpan = { updateName: vi.fn(), setAttribute: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    rootSpanAttributes = {};
    mockGetUser.mockReturnValue({});
    getActiveSpanMock.mockReturnValue(activeSpan);
  });

  function getConnInfoStub(remote: Record<string, unknown>): () => { remote: Record<string, unknown> } {
    return vi.fn(() => ({ remote }));
  }

  function mockUserInfo(userInfo: boolean): void {
    getClientMock.mockReturnValue({
      getDataCollectionOptions: () => ({ userInfo }),
    });
  }

  it('sets non-PII attributes (port, transport, type) regardless of userInfo', async () => {
    mockUserInfo(false);
    const getConnInfo = getConnInfoStub({ port: 54321, transport: 'tcp', addressType: 'IPv4' });

    await runMiddleware(createMockContext(200), { getConnInfo });

    expect(rootSpanAttributes['client.port']).toBe(54321);
    expect(rootSpanAttributes['network.peer.port']).toBe(54321);
    expect(rootSpanAttributes['network.transport']).toBe('tcp');
    expect(rootSpanAttributes['network.type']).toBe('ipv4');
    expect(rootSpanAttributes['client.address']).toBeUndefined();
  });

  it('sets IP-bearing attributes and user.ip_address when userInfo is true', async () => {
    mockUserInfo(true);
    const getConnInfo = getConnInfoStub({ address: '203.0.113.5', port: 443, addressType: 'IPv6' });

    await runMiddleware(createMockContext(200), { getConnInfo });

    expect(rootSpanAttributes['client.address']).toBe('203.0.113.5');
    expect(rootSpanAttributes['network.peer.address']).toBe('203.0.113.5');
    expect(rootSpanAttributes['network.type']).toBe('ipv6');
    expect(mockSetUser).toHaveBeenCalledWith({ ip_address: '203.0.113.5' });
  });

  it('merges ip_address into the existing user without overwriting other fields', async () => {
    mockUserInfo(true);
    mockGetUser.mockReturnValue({ id: 'user-123', email: 'jane@example.com' });
    const getConnInfo = getConnInfoStub({ address: '203.0.113.5', port: 443 });

    await runMiddleware(createMockContext(200), { getConnInfo });

    expect(mockSetUser).toHaveBeenCalledWith({
      id: 'user-123',
      email: 'jane@example.com',
      ip_address: '203.0.113.5',
    });
  });

  it('omits IP-bearing attributes when userInfo is false', async () => {
    mockUserInfo(false);
    const getConnInfo = getConnInfoStub({ address: '203.0.113.5', port: 8080 });

    await runMiddleware(createMockContext(200), { getConnInfo });

    expect(rootSpanAttributes['client.address']).toBeUndefined();
    expect(rootSpanAttributes['network.peer.address']).toBeUndefined();
    expect(mockSetUser).not.toHaveBeenCalled();
    // Non-PII data is still recorded.
    expect(rootSpanAttributes['client.port']).toBe(8080);
  });

  it('sets no connection attributes when remote info is empty', async () => {
    mockUserInfo(true);
    const getConnInfo = getConnInfoStub({});

    await runMiddleware(createMockContext(200), { getConnInfo });

    expect(rootSpanAttributes['client.port']).toBeUndefined();
    expect(rootSpanAttributes['network.peer.port']).toBeUndefined();
    expect(rootSpanAttributes['network.transport']).toBeUndefined();
    expect(rootSpanAttributes['network.type']).toBeUndefined();
    expect(rootSpanAttributes['client.address']).toBeUndefined();
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('does not throw or set attributes when getConnInfo throws', async () => {
    mockUserInfo(true);
    const getConnInfo = vi.fn(() => {
      throw new Error('socket unavailable');
    });

    await expect(runMiddleware(createMockContext(200), { getConnInfo })).resolves.toBeUndefined();
    expect(rootSpanAttributes['client.port']).toBeUndefined();
    expect(rootSpanAttributes['client.address']).toBeUndefined();
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('does not set connection attributes when there is no active span', async () => {
    mockUserInfo(true);
    getActiveSpanMock.mockReturnValue(null);
    const getConnInfo = getConnInfoStub({ address: '203.0.113.5', port: 443 });

    await runMiddleware(createMockContext(200), { getConnInfo });

    expect(getConnInfo).not.toHaveBeenCalled();
    expect(rootSpanAttributes).toEqual({});
  });

  it('is a no-op when getConnInfo is not provided', async () => {
    mockUserInfo(true);

    await runMiddleware(createMockContext(200));

    expect(rootSpanAttributes['client.port']).toBeUndefined();
    expect(mockSetUser).not.toHaveBeenCalled();
  });
});
