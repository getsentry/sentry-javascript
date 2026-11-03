import {
  CLIENT_ADDRESS,
  CLIENT_PORT,
  HTTP_ROUTE,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  NETWORK_TRANSPORT,
  NETWORK_TYPE,
  SENTRY_SEGMENT_NAME_SOURCE,
} from '@sentry/conventions/attributes';
import * as SentryCore from '@sentry/core';
import { createHonoRequestMiddleware } from '@sentry/server-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// These exercise the request/response handlers via the public `createHonoRequestMiddleware`, which
// runs `requestHandler` on the way in and `responseHandler` on the way out of `next()`.

const mockSetTransactionName = vi.fn();
const mockSetSDKProcessingMetadata = vi.fn();
const mockSetUser = vi.fn();
const mockGetUser = vi.fn<() => Record<string, unknown>>(() => ({}));

const mockRootSpan = {
  setAttribute: vi.fn(),
  setAttributes: vi.fn(),
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
const getRootSpanMock = SentryCore.getRootSpan as ReturnType<typeof vi.fn>;

// `event` throws on access so `hasFetchEvent` reports `false` (the Node/Bun/Deno path), which makes
// the request handler read request data from `req.raw` rather than a Cloudflare fetch event.
function createMockContext(status: number, error?: Error): object {
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
  const middleware = createHonoRequestMiddleware({ runtime: 'node', ...options });
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
  let rootSpan: SentryCore.SentrySpan;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockReturnValue({});
    rootSpan = new SentryCore.SentrySpan({ name: 'GET /test' });
    getActiveSpanMock.mockReturnValue(rootSpan);
    getRootSpanMock.mockReturnValue(rootSpan);
  });

  afterEach(() => {
    getRootSpanMock.mockReturnValue(mockRootSpan);
  });

  function getRootSpanAttributes(): Record<string, unknown> {
    return SentryCore.spanToJSON(rootSpan).attributes ?? {};
  }

  function mockUserInfo(userInfo: boolean): void {
    getClientMock.mockReturnValue({
      getDataCollectionOptions: () => ({ userInfo }),
    });
  }

  // The `c.env` that `@hono/node-server` passes to `app.fetch`.
  function createNodeContext(socket: Record<string, unknown>, headers?: Record<string, string>): object {
    const context = createMockContext(200) as { req: { raw: Request } };
    context.req.raw = new Request('http://localhost/test', { headers });
    return Object.assign(context, { env: { incoming: { socket } } });
  }

  it('sets the peer port and address type regardless of userInfo', async () => {
    mockUserInfo(false);

    await runMiddleware(createNodeContext({ remoteAddress: '203.0.113.5', remotePort: 54321, remoteFamily: 'IPv4' }));

    const attributes = getRootSpanAttributes();
    expect(attributes[NETWORK_PEER_PORT]).toBe(54321);
    expect(attributes[NETWORK_TYPE]).toBe('ipv4');
  });

  it('sets IP-bearing attributes and user.ip_address when userInfo is true', async () => {
    mockUserInfo(true);

    await runMiddleware(createNodeContext({ remoteAddress: '203.0.113.5', remotePort: 443, remoteFamily: 'IPv6' }));

    const attributes = getRootSpanAttributes();
    expect(attributes[CLIENT_ADDRESS]).toBe('203.0.113.5');
    expect(attributes[CLIENT_PORT]).toBe(443);
    expect(attributes[NETWORK_PEER_ADDRESS]).toBe('203.0.113.5');
    expect(attributes[NETWORK_TYPE]).toBe('ipv6');
    expect(mockSetUser).toHaveBeenCalledWith({ ip_address: '203.0.113.5' });
  });

  it('merges ip_address into the existing user without overwriting other fields', async () => {
    mockUserInfo(true);
    mockGetUser.mockReturnValue({ id: 'user-123', email: 'jane@example.com' });

    await runMiddleware(createNodeContext({ remoteAddress: '203.0.113.5', remotePort: 443 }));

    expect(mockSetUser).toHaveBeenCalledWith({
      id: 'user-123',
      email: 'jane@example.com',
      ip_address: '203.0.113.5',
    });
  });

  it('omits IP-bearing attributes when userInfo is false', async () => {
    mockUserInfo(false);

    await runMiddleware(
      createNodeContext({ remoteAddress: '203.0.113.5', remotePort: 8080 }, { 'x-forwarded-for': '198.51.100.7' }),
    );

    const attributes = getRootSpanAttributes();
    expect(attributes).not.toHaveProperty(CLIENT_ADDRESS);
    expect(attributes).not.toHaveProperty(CLIENT_PORT);
    expect(attributes).not.toHaveProperty(NETWORK_PEER_ADDRESS);
    expect(mockSetUser).not.toHaveBeenCalled();
    // Non-PII data is still recorded.
    expect(attributes[NETWORK_PEER_PORT]).toBe(8080);
  });

  it('does not write the attributes that the runtime does not give', async () => {
    mockUserInfo(true);
    rootSpan.setAttribute(NETWORK_TRANSPORT, 'tcp');

    await runMiddleware(createNodeContext({ remotePort: 54321 }));

    const attributes = getRootSpanAttributes();
    expect(attributes[NETWORK_TRANSPORT]).toBe('tcp');
    expect(attributes).not.toHaveProperty(CLIENT_ADDRESS);
    expect(attributes).not.toHaveProperty(NETWORK_TYPE);
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('does not throw or set attributes when a runtime object throws', async () => {
    mockUserInfo(true);
    const incoming = Object.defineProperty({}, 'socket', {
      get() {
        throw new Error('socket unavailable');
      },
    });
    const context = Object.assign(createMockContext(200), { env: { incoming } });

    await expect(runMiddleware(context)).resolves.toBeUndefined();
    expect(getRootSpanAttributes()).not.toHaveProperty(CLIENT_PORT);
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('does not set connection attributes when there is no active span', async () => {
    mockUserInfo(true);
    getActiveSpanMock.mockReturnValue(null);

    await runMiddleware(createNodeContext({ remoteAddress: '203.0.113.5', remotePort: 443 }));

    const attributes = getRootSpanAttributes();
    expect(attributes).not.toHaveProperty(CLIENT_ADDRESS);
    expect(attributes).not.toHaveProperty(NETWORK_PEER_PORT);
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('sets no connection attributes when the runtime objects are missing', async () => {
    mockUserInfo(true);

    await runMiddleware(createMockContext(200));

    const attributes = getRootSpanAttributes();
    expect(attributes).not.toHaveProperty(CLIENT_PORT);
    expect(attributes).not.toHaveProperty(CLIENT_ADDRESS);
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('sets the transport that the runtime gives', async () => {
    mockUserInfo(false);
    const context = Object.assign(createMockContext(200), {
      env: { remoteAddr: { hostname: '203.0.113.5', port: 54321, transport: 'tcp' } },
    });

    await runMiddleware(context, { runtime: 'deno' });

    expect(getRootSpanAttributes()[NETWORK_TRANSPORT]).toBe('tcp');
  });

  it('keeps attributes that are already on the root span', async () => {
    mockUserInfo(true);
    rootSpan.setAttributes({ [CLIENT_ADDRESS]: '198.51.100.7', [CLIENT_PORT]: 1234 });

    await runMiddleware(createNodeContext({ remoteAddress: '10.0.0.1', remotePort: 54321 }));

    const attributes = getRootSpanAttributes();
    expect(attributes[CLIENT_ADDRESS]).toBe('198.51.100.7');
    expect(attributes[CLIENT_PORT]).toBe(1234);
    expect(attributes[NETWORK_PEER_ADDRESS]).toBe('10.0.0.1');
    expect(attributes[NETWORK_PEER_PORT]).toBe(54321);
  });

  it('does not pair the socket port with a client.address that is already on the root span', async () => {
    mockUserInfo(true);
    // Set by the runtime SDK from a forwarding header, without a port.
    rootSpan.setAttribute(CLIENT_ADDRESS, '198.51.100.7');

    await runMiddleware(createNodeContext({ remoteAddress: '10.0.0.1', remotePort: 54321 }));

    const attributes = getRootSpanAttributes();
    expect(attributes[CLIENT_ADDRESS]).toBe('198.51.100.7');
    expect(attributes).not.toHaveProperty(CLIENT_PORT);
    expect(attributes[NETWORK_PEER_PORT]).toBe(54321);
  });

  it('sets user.ip_address from a forwarding header before the socket address', async () => {
    mockUserInfo(true);

    await runMiddleware(
      createNodeContext({ remoteAddress: '10.0.0.1', remotePort: 54321 }, { 'x-forwarded-for': '198.51.100.7' }),
    );

    expect(mockSetUser).toHaveBeenCalledWith({ ip_address: '198.51.100.7' });
    expect(getRootSpanAttributes()[NETWORK_PEER_ADDRESS]).toBe('10.0.0.1');
  });
});
