import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestHandler, responseHandler } from '../../src/shared/middlewareHandlers';

vi.mock('hono/route', () => ({
  routePath: () => '/test',
}));

vi.mock('../../src/utils/hono-context', () => ({
  hasFetchEvent: () => false,
}));

const mockSetTransactionName = vi.fn();
const mockSetSDKProcessingMetadata = vi.fn();
const mockSetUser = vi.fn();

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
    })),
    getClient: vi.fn(() => undefined),
  };
});

const getClientMock = SentryCore.getClient as ReturnType<typeof vi.fn>;
const getActiveSpanMock = SentryCore.getActiveSpan as ReturnType<typeof vi.fn>;

function createMockContext(status: number, error?: Error): unknown {
  return {
    req: { method: 'GET', raw: new Request('http://localhost/test') },
    res: { status },
    error,
  };
}

describe('responseHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('error capture — default behavior (no shouldHandleError)', () => {
    it('captures error when context.error is set', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({
        captureException: mockCaptureException,
      });

      const error = new Error('server error');
      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(500, error) as any);

      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    });

    it('captures plain Error with no status (not an HTTPException) regardless of response status', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({
        captureException: mockCaptureException,
      });

      const error = new Error('plain error, no status property');
      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(404, error) as any);

      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    });

    it('does not call captureException when there is no error', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({
        captureException: mockCaptureException,
      });

      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(200) as any);

      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('does not throw when client is undefined', () => {
      getClientMock.mockReturnValue(undefined);

      // oxlint-disable-next-line typescript/no-explicit-any
      expect(() => responseHandler(createMockContext(500, new Error('boom')) as any)).not.toThrow();
    });

    it('delegates deduplication to captureException — calls it even for errors with __sentry_captured__', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({
        captureException: mockCaptureException,
      });

      const error = new Error('already captured');
      Object.defineProperty(error, '__sentry_captured__', { value: true, writable: false });

      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(500, error) as any);

      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    });

    it('does not capture 4xx HTTPException (status on error object)', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({
        captureException: mockCaptureException,
      });

      const error = Object.assign(new Error('Not Found'), { status: 404 });
      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(404, error) as any);

      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('does not capture 3xx HTTPException (status on error object)', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({
        captureException: mockCaptureException,
      });

      const error = Object.assign(new Error('Redirect'), { status: 301 });
      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(301, error) as any);

      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('captures 5xx HTTPException (status on error object)', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({
        captureException: mockCaptureException,
      });

      const error = Object.assign(new Error('Service Unavailable'), { status: 503 });
      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(503, error) as any);

      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    });
  });

  describe('error capture — custom shouldHandleError', () => {
    it('calls shouldHandleError with the error and captures when it returns true', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({ captureException: mockCaptureException });

      const shouldHandleError = vi.fn().mockReturnValue(true);
      const error = Object.assign(new Error('Not Found'), { status: 404 });

      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(404, error) as any, shouldHandleError);

      expect(shouldHandleError).toHaveBeenCalledWith(error);
      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    });

    it('does not capture when shouldHandleError returns false', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({ captureException: mockCaptureException });

      const shouldHandleError = vi.fn().mockReturnValue(false);
      const error = new Error('suppressed 500 error');

      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(500, error) as any, shouldHandleError);

      expect(shouldHandleError).toHaveBeenCalledWith(error);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('captures 4xx error that would normally be skipped when shouldHandleError returns true', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({ captureException: mockCaptureException });

      const error = Object.assign(new Error('Unauthorized'), { status: 401 });
      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(401, error) as any, () => true);

      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    });

    it('suppresses 5xx error when shouldHandleError returns false', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({ captureException: mockCaptureException });

      const error = Object.assign(new Error('Internal Server Error'), { status: 500 });
      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(500, error) as any, () => false);

      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('does not invoke shouldHandleError when context.error is absent', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({ captureException: mockCaptureException });

      const shouldHandleError = vi.fn().mockReturnValue(true);
      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(200) as any, shouldHandleError);

      expect(shouldHandleError).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });

  describe('transaction name', () => {
    it('sets transaction name on isolation scope', () => {
      // oxlint-disable-next-line typescript/no-explicit-any
      requestHandler(createMockContext(200) as any);

      expect(mockSetTransactionName).toHaveBeenCalledWith('GET /test');
    });
  });
});

describe('requestHandler — connection info', () => {
  const activeSpan = { updateName: vi.fn(), setAttribute: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    rootSpanAttributes = {};
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

  it('sets non-PII attributes (port, transport, type) regardless of userInfo', () => {
    mockUserInfo(false);
    const getConnInfo = getConnInfoStub({ port: 54321, transport: 'tcp', addressType: 'IPv4' });

    // oxlint-disable-next-line typescript/no-explicit-any
    requestHandler(createMockContext(200) as any, getConnInfo as any);

    expect(rootSpanAttributes['client.port']).toBe(54321);
    expect(rootSpanAttributes['network.peer.port']).toBe(54321);
    expect(rootSpanAttributes['network.transport']).toBe('tcp');
    expect(rootSpanAttributes['network.type']).toBe('ipv4');
    expect(rootSpanAttributes['client.address']).toBeUndefined();
  });

  it('sets IP-bearing attributes and user.ip_address when userInfo is true', () => {
    mockUserInfo(true);
    const getConnInfo = getConnInfoStub({ address: '203.0.113.5', port: 443, addressType: 'IPv6' });

    // oxlint-disable-next-line typescript/no-explicit-any
    requestHandler(createMockContext(200) as any, getConnInfo as any);

    expect(rootSpanAttributes['client.address']).toBe('203.0.113.5');
    expect(rootSpanAttributes['network.peer.address']).toBe('203.0.113.5');
    expect(rootSpanAttributes['network.type']).toBe('ipv6');
    expect(mockSetUser).toHaveBeenCalledWith({ ip_address: '203.0.113.5' });
  });

  it('omits IP-bearing attributes when userInfo is false', () => {
    mockUserInfo(false);
    const getConnInfo = getConnInfoStub({ address: '203.0.113.5', port: 8080 });

    // oxlint-disable-next-line typescript/no-explicit-any
    requestHandler(createMockContext(200) as any, getConnInfo as any);

    expect(rootSpanAttributes['client.address']).toBeUndefined();
    expect(rootSpanAttributes['network.peer.address']).toBeUndefined();
    expect(mockSetUser).not.toHaveBeenCalled();
    // Non-PII data is still recorded.
    expect(rootSpanAttributes['client.port']).toBe(8080);
  });

  it('sets no connection attributes when remote info is empty', () => {
    mockUserInfo(true);
    const getConnInfo = getConnInfoStub({});

    // oxlint-disable-next-line typescript/no-explicit-any
    requestHandler(createMockContext(200) as any, getConnInfo as any);

    expect(rootSpanAttributes['client.port']).toBeUndefined();
    expect(rootSpanAttributes['network.peer.port']).toBeUndefined();
    expect(rootSpanAttributes['network.transport']).toBeUndefined();
    expect(rootSpanAttributes['network.type']).toBeUndefined();
    expect(rootSpanAttributes['client.address']).toBeUndefined();
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('does not throw or set attributes when getConnInfo throws', () => {
    mockUserInfo(true);
    const getConnInfo = vi.fn(() => {
      throw new Error('socket unavailable');
    });

    expect(() =>
      // oxlint-disable-next-line typescript/no-explicit-any
      requestHandler(createMockContext(200) as any, getConnInfo as any),
    ).not.toThrow();
    expect(rootSpanAttributes['client.port']).toBeUndefined();
    expect(rootSpanAttributes['client.address']).toBeUndefined();
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('does not set connection attributes when there is no active span', () => {
    mockUserInfo(true);
    getActiveSpanMock.mockReturnValue(null);
    const getConnInfo = getConnInfoStub({ address: '203.0.113.5', port: 443 });

    // oxlint-disable-next-line typescript/no-explicit-any
    requestHandler(createMockContext(200) as any, getConnInfo as any);

    expect(getConnInfo).not.toHaveBeenCalled();
    expect(rootSpanAttributes).toEqual({});
  });

  it('is a no-op when getConnInfo is not provided', () => {
    mockUserInfo(true);

    // oxlint-disable-next-line typescript/no-explicit-any
    requestHandler(createMockContext(200) as any);

    expect(rootSpanAttributes['client.port']).toBeUndefined();
    expect(mockSetUser).not.toHaveBeenCalled();
  });
});
