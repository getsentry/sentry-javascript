import * as SentryCore from '@sentry/core';
import { SPAN_STATUS_ERROR } from '@sentry/core';
import { type MiddlewareHandler } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapMiddlewareWithSpan } from '../../src/shared/wrapMiddlewareSpan';

const mockSpan = {
  setStatus: vi.fn(),
  end: vi.fn(),
};

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startInactiveSpan: vi.fn(() => mockSpan),
    getActiveSpan: vi.fn(() => ({ spanId: 'root-span' })),
    getRootSpan: vi.fn(span => span),
    getOriginalFunction: vi.fn(() => undefined),
  };
});

const startInactiveSpanMock = SentryCore.startInactiveSpan as ReturnType<typeof vi.fn>;

function makeContext(): unknown {
  return { req: { method: 'GET' }, res: { status: 200 } };
}

const noop: () => Promise<void> = async () => {};

describe('wrapMiddlewareWithSpan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startInactiveSpanMock.mockReturnValue(mockSpan);
  });

  describe('span status', () => {
    it('does not set span error status for a 4xx error', async () => {
      const error = Object.assign(new Error('Not Found'), { status: 404 });
      const handler: MiddlewareHandler = async () => {
        throw error;
      };

      const wrapped = wrapMiddlewareWithSpan(handler);

      await expect(wrapped(makeContext() as any, noop)).rejects.toThrow(error);

      expect(mockSpan.setStatus).not.toHaveBeenCalled();
    });

    it('sets span status to error for a 5xx error', async () => {
      const error = Object.assign(new Error('Server Error'), { status: 500 });
      const handler: MiddlewareHandler = async () => {
        throw error;
      };

      const wrapped = wrapMiddlewareWithSpan(handler);

      await expect(wrapped(makeContext() as any, noop)).rejects.toThrow(error);

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    });

    it('sets span status to error for a plain Error with no status', async () => {
      const error = new Error('unexpected failure');
      const handler: MiddlewareHandler = async () => {
        throw error;
      };

      const wrapped = wrapMiddlewareWithSpan(handler);

      await expect(wrapped(makeContext() as any, noop)).rejects.toThrow(error);

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    });

    it('does not set span error status for a 3xx error', async () => {
      const error = Object.assign(new Error('Redirect'), { status: 301 });
      const handler: MiddlewareHandler = async () => {
        throw error;
      };

      const wrapped = wrapMiddlewareWithSpan(handler);

      await expect(wrapped(makeContext() as any, noop)).rejects.toThrow(error);

      expect(mockSpan.setStatus).not.toHaveBeenCalled();
    });
  });

  describe('span lifecycle', () => {
    it('always rethrows the error', async () => {
      const error = new Error('must propagate');
      const handler: MiddlewareHandler = async () => {
        throw error;
      };

      const wrapped = wrapMiddlewareWithSpan(handler);

      await expect(wrapped(makeContext() as any, noop)).rejects.toThrow('must propagate');
    });

    it('ends the span even when the handler throws', async () => {
      const handler: MiddlewareHandler = async () => {
        throw new Error('boom');
      };

      const wrapped = wrapMiddlewareWithSpan(handler);

      await expect(wrapped(makeContext() as any, noop)).rejects.toThrow();

      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });

    it('ends the span when the handler succeeds', async () => {
      const handler: MiddlewareHandler = async (_c, next) => {
        await next();
      };

      const wrapped = wrapMiddlewareWithSpan(handler);

      await wrapped(makeContext() as any, noop);

      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });
  });
});
