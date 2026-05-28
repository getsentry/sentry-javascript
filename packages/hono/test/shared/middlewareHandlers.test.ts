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

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    getActiveSpan: vi.fn(() => null),
    getIsolationScope: vi.fn(() => ({
      setTransactionName: mockSetTransactionName,
      setSDKProcessingMetadata: mockSetSDKProcessingMetadata,
    })),
    getClient: vi.fn(() => undefined),
  };
});

const getClientMock = SentryCore.getClient as ReturnType<typeof vi.fn>;

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
