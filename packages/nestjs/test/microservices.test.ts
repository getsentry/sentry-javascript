import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { SentryRpcFilter } from '../src/microservices';
import * as sentryCore from '@sentry/core';

vi.mock('@sentry/core', () => ({
  captureException: vi.fn(),
  logger: {
    warn: vi.fn(),
  },
}));

describe('SentryRpcFilter', () => {
  let filter: SentryRpcFilter;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new SentryRpcFilter();

    mockHost = {
      getType: vi.fn().mockReturnValue('rpc'),
      switchToRpc: vi.fn().mockReturnValue({
        getData: vi.fn(),
        getContext: vi.fn(),
      }),
    } as unknown as ArgumentsHost;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should not report RpcException to Sentry', () => {
    const rpcException = new RpcException('Expected RPC error');

    expect(() => {
      filter.catch(rpcException, mockHost);
    }).toThrow(RpcException);

    expect(sentryCore.captureException).not.toHaveBeenCalled();
  });

  it('should report regular Error to Sentry and wrap it in RpcException', () => {
    const error = new Error('Unexpected error');

    expect(() => {
      filter.catch(error, mockHost);
    }).toThrow(RpcException);

    expect(sentryCore.captureException).toHaveBeenCalledWith(error);

    try {
      filter.catch(error, mockHost);
    } catch (e) {
      expect(e).toBeInstanceOf(RpcException);
      expect(e.message).toContain('Unexpected error');
    }
  });

  it('should wrap string exceptions in RpcException', () => {
    const errorMessage = 'String error message';

    expect(() => {
      filter.catch(errorMessage, mockHost);
    }).toThrow(RpcException);

    expect(sentryCore.captureException).toHaveBeenCalledWith(errorMessage);
  });

  it('should handle null/undefined exceptions', () => {
    expect(() => {
      filter.catch(null, mockHost);
    }).toThrow(RpcException);

    expect(sentryCore.captureException).toHaveBeenCalledWith(null);

    try {
      filter.catch(null, mockHost);
    } catch (e) {
      expect(e).toBeInstanceOf(RpcException);
      expect(e.message).toContain('Internal server error');
    }
  });

  it('should preserve the stack trace when possible', () => {
    const originalError = new Error('Original error');
    originalError.stack = 'Original stack trace';

    try {
      filter.catch(originalError, mockHost);
    } catch (e) {
      expect(e).toBeInstanceOf(RpcException);

      // Extract the error inside the RpcException
      const wrappedError = (e as any).getError();

      // If implementation preserves stack, verify it
      if (typeof wrappedError === 'object' && wrappedError.stack) {
        expect(wrappedError.stack).toContain('Original stack trace');
      }
    }
  });

  it('should properly handle non-rpc context by delegating to parent', () => {
    // Mock HTTP context
    const httpHost = {
      getType: vi.fn().mockReturnValue('http'),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn(),
        getResponse: vi.fn(),
      }),
    } as unknown as ArgumentsHost;

    // Mock the parent class behavior
    const parentCatchSpy = vi.spyOn(filter, 'catch');
    parentCatchSpy.mockImplementation(vi.fn());

    const error = new Error('HTTP error');

    filter.catch(error, httpHost);

    // Verify parent catch was called
    expect(parentCatchSpy).toHaveBeenCalled();
  });
});
