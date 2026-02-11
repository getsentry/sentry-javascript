/* eslint-disable @typescript-eslint/unbound-method */
import type { ArgumentsHost } from '@nestjs/common';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Helpers from '../src/helpers';
import { SentryGlobalFilter } from '../src/setup';

vi.mock('../src/helpers', () => ({
  isExpectedError: vi.fn(),
}));

vi.mock('@sentry/core', () => ({
  captureException: vi.fn().mockReturnValue('mock-event-id'),
  getIsolationScope: vi.fn(),
  getDefaultIsolationScope: vi.fn(),
  logger: {
    warn: vi.fn(),
  },
}));

describe('SentryGlobalFilter', () => {
  let filter: SentryGlobalFilter;
  let mockArgumentsHost: ArgumentsHost;
  let mockHttpServer: any;
  let mockCaptureException: any;
  let mockLoggerError: any;
  let mockLoggerWarn: any;
  let isExpectedErrorMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockHttpServer = {
      getRequestMethod: vi.fn(),
      getRequestUrl: vi.fn(),
    };

    filter = new SentryGlobalFilter(mockHttpServer);

    mockArgumentsHost = {
      getType: vi.fn().mockReturnValue('http'),
      getArgs: vi.fn().mockReturnValue([]),
      getArgByIndex: vi.fn().mockReturnValue({}),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({}),
        getResponse: vi.fn().mockReturnValue({}),
        getNext: vi.fn(),
      }),
      switchToRpc: vi.fn(),
      switchToWs: vi.fn(),
    } as unknown as ArgumentsHost;

    mockLoggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    mockLoggerWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    mockCaptureException = vi.spyOn(SentryCore, 'captureException').mockReturnValue('mock-event-id');

    isExpectedErrorMock = vi.mocked(Helpers.isExpectedError).mockImplementation(() => false);
  });

  describe('HTTP context', () => {
    beforeEach(() => {
      vi.mocked(mockArgumentsHost.getType).mockReturnValue('http');
    });

    it('should capture non-HttpException errors and call super.catch for HTTP context', () => {
      const originalCatch = filter.catch;
      const superCatchSpy = vi.fn();
      filter.catch = function (exception, host) {
        if (!Helpers.isExpectedError(exception)) {
          SentryCore.captureException(exception);
        }
        superCatchSpy(exception, host);
        return {} as any;
      };

      const error = new Error('Test error');

      filter.catch(error, mockArgumentsHost);

      expect(mockCaptureException).toHaveBeenCalledWith(error);
      expect(superCatchSpy).toHaveBeenCalled();

      filter.catch = originalCatch;
    });

    it('should not capture expected errors', () => {
      const originalCatch = filter.catch;
      const superCatchSpy = vi.fn();

      isExpectedErrorMock.mockReturnValueOnce(true);

      filter.catch = function (exception, host) {
        if (!Helpers.isExpectedError(exception)) {
          SentryCore.captureException(exception);
        }
        superCatchSpy(exception, host);
        return {} as any;
      };

      const expectedError = new Error('Test error');

      filter.catch(expectedError, mockArgumentsHost);

      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(superCatchSpy).toHaveBeenCalled();

      filter.catch = originalCatch;
    });
  });

  describe('GraphQL context', () => {
    beforeEach(() => {
      vi.mocked(mockArgumentsHost.getType).mockReturnValue('graphql');
    });

    it('should throw HttpExceptions without capturing them', () => {
      const httpException = new HttpException('Test HTTP exception', HttpStatus.BAD_REQUEST);

      expect(() => {
        filter.catch(httpException, mockArgumentsHost);
      }).toThrow(httpException);

      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('should log and capture non-HttpException errors in GraphQL context', () => {
      const error = new Error('Test error');

      expect(() => {
        filter.catch(error, mockArgumentsHost);
      }).toThrow(error);

      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        mechanism: {
          handled: false,
          type: 'auto.graphql.nestjs.global_filter',
        },
      });
      expect(mockLoggerError).toHaveBeenCalledWith(error.message, error.stack);
    });
  });

  describe('RPC context', () => {
    beforeEach(() => {
      vi.mocked(mockArgumentsHost.getType).mockReturnValue('rpc');
    });

    it('should log a warning for RPC exceptions', () => {
      const error = new Error('Test RPC error');

      const originalCatch = filter.catch;
      filter.catch = function (exception, _host) {
        if (!Helpers.isExpectedError(exception)) {
          SentryCore.captureException(exception);
        }

        if (exception instanceof Error) {
          mockLoggerError(exception.message, exception.stack);
        }

        mockLoggerWarn(
          'IMPORTANT: RpcException should be handled with a dedicated Rpc exception filter, not the generic SentryGlobalFilter',
        );

        return undefined as any;
      };

      filter.catch(error, mockArgumentsHost);

      expect(mockCaptureException).toHaveBeenCalledWith(error);
      expect(mockLoggerWarn).toHaveBeenCalled();
      expect(mockLoggerError).toHaveBeenCalledWith(error.message, error.stack);

      filter.catch = originalCatch;
    });

    it('should not capture expected RPC errors', () => {
      isExpectedErrorMock.mockReturnValueOnce(true);

      const originalCatch = filter.catch;
      filter.catch = function (exception, _host) {
        if (!Helpers.isExpectedError(exception)) {
          SentryCore.captureException(exception);
        }

        if (exception instanceof Error) {
          mockLoggerError(exception.message, exception.stack);
        }

        mockLoggerWarn(
          'IMPORTANT: RpcException should be handled with a dedicated Rpc exception filter, not the generic SentryGlobalFilter',
        );

        return undefined as any;
      };

      const expectedError = new Error('Expected RPC error');

      filter.catch(expectedError, mockArgumentsHost);

      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockLoggerWarn).toHaveBeenCalled();
      expect(mockLoggerError).toHaveBeenCalledWith(expectedError.message, expectedError.stack);

      filter.catch = originalCatch;
    });

    it('should handle non-Error objects in RPC context', () => {
      const nonErrorObject = { message: 'Not an Error object' };

      const originalCatch = filter.catch;
      filter.catch = function (exception, _host) {
        if (!Helpers.isExpectedError(exception)) {
          SentryCore.captureException(exception);
        }

        return undefined as any;
      };

      filter.catch(nonErrorObject, mockArgumentsHost);

      expect(mockCaptureException).toHaveBeenCalledWith(nonErrorObject);

      filter.catch = originalCatch;
    });

    it('should throw HttpExceptions in RPC context without capturing', () => {
      const httpException = new HttpException('Test HTTP exception', HttpStatus.BAD_REQUEST);

      expect(() => {
        filter.catch(httpException, mockArgumentsHost);
      }).toThrow(httpException);

      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });
});
