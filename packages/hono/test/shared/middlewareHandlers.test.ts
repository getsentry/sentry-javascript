import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { responseHandler } from '../../src/shared/middlewareHandlers';

vi.mock('hono/route', () => ({
  routePath: () => '/test',
}));

vi.mock('../../src/utils/hono-context', () => ({
  hasFetchEvent: () => false,
}));

const mockSetTransactionName = vi.fn();

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    getActiveSpan: vi.fn(() => null),
    getIsolationScope: vi.fn(() => ({
      setTransactionName: mockSetTransactionName,
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

  describe('error capture', () => {
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

    it('captures error regardless of status code', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({
        captureException: mockCaptureException,
      });

      const error = new Error('not found');
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

    it('does not re-capture errors already captured by wrapMiddlewareWithSpan', () => {
      const mockCaptureException = vi.fn();
      getClientMock.mockReturnValue({
        captureException: mockCaptureException,
      });

      const error = new Error('already captured');
      Object.defineProperty(error, '__sentry_captured__', { value: true, writable: false });

      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(500, error) as any);

      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });

  describe('transaction name', () => {
    it('sets transaction name on isolation scope', () => {
      // oxlint-disable-next-line typescript/no-explicit-any
      responseHandler(createMockContext(200) as any);

      expect(mockSetTransactionName).toHaveBeenCalledWith('GET /test');
    });
  });
});
