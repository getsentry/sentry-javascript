import * as core from '@sentry/core';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSentryHandleError } from '../../src/server/createSentryHandleError';

vi.mock('@sentry/core', () => ({
  captureException: vi.fn(),
  flushIfServerless: vi.fn().mockResolvedValue(undefined),
}));

const mechanism = {
  handled: false,
  type: 'react-router',
};

describe('createSentryHandleError', () => {
  const mockCaptureException = vi.mocked(core.captureException);
  const mockFlushIfServerless = vi.mocked(core.flushIfServerless);
  const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  const mockError = new Error('Test error');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockConsoleError.mockClear();
  });

  const createMockArgs = (aborted: boolean): LoaderFunctionArgs => {
    const controller = new AbortController();
    if (aborted) {
      controller.abort();
    }

    const request = {
      signal: controller.signal,
    } as Request;

    return { request } as LoaderFunctionArgs;
  };

  describe('with default options', () => {
    it('should create a handle error function with logErrors disabled by default', async () => {
      const handleError = createSentryHandleError({});

      expect(typeof handleError).toBe('function');
    });

    it('should capture exception and flush when request is not aborted', async () => {
      const handleError = createSentryHandleError({});
      const mockArgs = createMockArgs(false);

      await handleError(mockError, mockArgs);

      expect(mockCaptureException).toHaveBeenCalledWith(mockError, { mechanism });
      expect(mockFlushIfServerless).toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should not capture exception when request is aborted', async () => {
      const handleError = createSentryHandleError({});
      const mockArgs = createMockArgs(true);

      await handleError(mockError, mockArgs);

      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockFlushIfServerless).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
    });
  });

  describe('with logErrors enabled', () => {
    it('should log errors to console when logErrors is true', async () => {
      const handleError = createSentryHandleError({ logErrors: true });
      const mockArgs = createMockArgs(false);

      await handleError(mockError, mockArgs);

      expect(mockCaptureException).toHaveBeenCalledWith(mockError, { mechanism });
      expect(mockFlushIfServerless).toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalledWith(mockError);
    });

    it('should not log errors to console when request is aborted even with logErrors enabled', async () => {
      const handleError = createSentryHandleError({ logErrors: true });
      const mockArgs = createMockArgs(true);

      await handleError(mockError, mockArgs);

      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockFlushIfServerless).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
    });
  });

  describe('with logErrors disabled explicitly', () => {
    it('should not log errors to console when logErrors is false', async () => {
      const handleError = createSentryHandleError({ logErrors: false });
      const mockArgs = createMockArgs(false);

      await handleError(mockError, mockArgs);

      expect(mockCaptureException).toHaveBeenCalledWith(mockError, { mechanism });
      expect(mockFlushIfServerless).toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
    });
  });

  describe('with different error types', () => {
    it('should handle string errors', async () => {
      const handleError = createSentryHandleError({});
      const stringError = 'String error message';
      const mockArgs = createMockArgs(false);

      await handleError(stringError, mockArgs);

      expect(mockCaptureException).toHaveBeenCalledWith(stringError, { mechanism });
      expect(mockFlushIfServerless).toHaveBeenCalled();
    });

    it('should handle null/undefined errors', async () => {
      const handleError = createSentryHandleError({});
      const mockArgs = createMockArgs(false);

      await handleError(null, mockArgs);

      expect(mockCaptureException).toHaveBeenCalledWith(null, { mechanism });
      expect(mockFlushIfServerless).toHaveBeenCalled();
    });

    it('should handle custom error objects', async () => {
      const handleError = createSentryHandleError({});
      const customError = { message: 'Custom error', code: 500 };
      const mockArgs = createMockArgs(false);

      await handleError(customError, mockArgs);

      expect(mockCaptureException).toHaveBeenCalledWith(customError, { mechanism });
      expect(mockFlushIfServerless).toHaveBeenCalled();
    });
  });

  describe('with ActionFunctionArgs', () => {
    it('should work with ActionFunctionArgs instead of LoaderFunctionArgs', async () => {
      const handleError = createSentryHandleError({ logErrors: true });
      const mockArgs = createMockArgs(false) as ActionFunctionArgs;

      await handleError(mockError, mockArgs);

      expect(mockCaptureException).toHaveBeenCalledWith(mockError, { mechanism });
      expect(mockFlushIfServerless).toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalledWith(mockError);
    });
  });

  describe('flushIfServerless behavior', () => {
    it('waits for flushIfServerless to complete', async () => {
      vi.useFakeTimers();
      const handleError = createSentryHandleError({});

      let resolveFlush: () => void;
      const flushPromise = new Promise<void>(resolve => {
        resolveFlush = resolve;
      });

      mockFlushIfServerless.mockReturnValueOnce(flushPromise);

      const mockArgs = createMockArgs(false);

      const startTime = Date.now();

      const handleErrorPromise = handleError(mockError, mockArgs);

      vi.advanceTimersByTime(10);
      resolveFlush!();

      await handleErrorPromise;
      const endTime = Date.now();

      expect(mockCaptureException).toHaveBeenCalledWith(mockError, { mechanism });
      expect(mockFlushIfServerless).toHaveBeenCalled();
      expect(endTime - startTime).toBeGreaterThanOrEqual(10);
    });

    it('should handle flushIfServerless rejection gracefully', async () => {
      const handleError = createSentryHandleError({});

      mockFlushIfServerless.mockRejectedValueOnce(new Error('Flush failed'));

      const mockArgs = createMockArgs(false);

      await expect(handleError(mockError, mockArgs)).resolves.toBeUndefined();

      expect(mockCaptureException).toHaveBeenCalledWith(mockError, { mechanism });
      expect(mockFlushIfServerless).toHaveBeenCalled();
    });
  });
});
