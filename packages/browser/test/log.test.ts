/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as sentryCore from '@sentry/core';
import { getGlobalScope, getCurrentScope, getIsolationScope } from '@sentry/core';

import { init, logger } from '../src';
import { makeSimpleTransport } from './mocks/simpletransport';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

// Mock the core functions
vi.mock('@sentry/core', async requireActual => {
  return {
    ...((await requireActual()) as any),
    _INTERNAL_captureLog: vi.fn(),
    _INTERNAL_flushLogsBuffer: vi.fn(),
  };
});

describe('Logger', () => {
  // Use the mocked functions
  const mockCaptureLog = vi.mocked(sentryCore._INTERNAL_captureLog);
  const mockFlushLogsBuffer = vi.mocked(sentryCore._INTERNAL_flushLogsBuffer);

  beforeEach(() => {
    // Reset mocks
    mockCaptureLog.mockClear();
    mockFlushLogsBuffer.mockClear();

    // Reset the global scope, isolation scope, and current scope
    getGlobalScope().clear();
    getIsolationScope().clear();
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);

    // Mock setTimeout and clearTimeout
    vi.useFakeTimers();

    // Initialize with logs enabled
    init({
      dsn,
      transport: makeSimpleTransport,
      _experiments: {
        enableLogs: true,
      },
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Logger methods', () => {
    it('should export all log methods', () => {
      expect(logger).toBeDefined();
      expect(logger.trace).toBeTypeOf('function');
      expect(logger.debug).toBeTypeOf('function');
      expect(logger.info).toBeTypeOf('function');
      expect(logger.warn).toBeTypeOf('function');
      expect(logger.error).toBeTypeOf('function');
      expect(logger.fatal).toBeTypeOf('function');
      expect(logger.critical).toBeTypeOf('function');
    });

    it('should call _INTERNAL_captureLog with trace level', () => {
      logger.trace('Test trace message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith(
        {
          level: 'trace',
          message: 'Test trace message',
          attributes: { key: 'value' },
          severityNumber: undefined,
        },
        expect.any(Object),
        undefined,
      );
    });

    it('should call _INTERNAL_captureLog with debug level', () => {
      logger.debug('Test debug message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith(
        {
          level: 'debug',
          message: 'Test debug message',
          attributes: { key: 'value' },
          severityNumber: undefined,
        },
        expect.any(Object),
        undefined,
      );
    });

    it('should call _INTERNAL_captureLog with info level', () => {
      logger.info('Test info message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith(
        {
          level: 'info',
          message: 'Test info message',
          attributes: { key: 'value' },
          severityNumber: undefined,
        },
        expect.any(Object),
        undefined,
      );
    });

    it('should call _INTERNAL_captureLog with warn level', () => {
      logger.warn('Test warn message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith(
        {
          level: 'warn',
          message: 'Test warn message',
          attributes: { key: 'value' },
          severityNumber: undefined,
        },
        expect.any(Object),
        undefined,
      );
    });

    it('should call _INTERNAL_captureLog with error level', () => {
      logger.error('Test error message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith(
        {
          level: 'error',
          message: 'Test error message',
          attributes: { key: 'value' },
          severityNumber: undefined,
        },
        expect.any(Object),
        undefined,
      );
    });

    it('should call _INTERNAL_captureLog with fatal level', () => {
      logger.fatal('Test fatal message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith(
        {
          level: 'fatal',
          message: 'Test fatal message',
          attributes: { key: 'value' },
          severityNumber: undefined,
        },
        expect.any(Object),
        undefined,
      );
    });
  });

  describe('Automatic flushing', () => {
    it('should flush logs after timeout', () => {
      logger.info('Test message');
      expect(mockFlushLogsBuffer).not.toHaveBeenCalled();

      // Fast-forward time by 5000ms (the default flush interval)
      vi.advanceTimersByTime(5000);

      expect(mockFlushLogsBuffer).toHaveBeenCalledTimes(1);
      expect(mockFlushLogsBuffer).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should restart the flush timeout when a new log is captured', () => {
      logger.info('First message');

      // Advance time by 3000ms (not enough to trigger flush)
      vi.advanceTimersByTime(3000);
      expect(mockFlushLogsBuffer).not.toHaveBeenCalled();

      // Log another message, which should reset the timer
      logger.info('Second message');

      // Advance time by 3000ms again (should be 6000ms total, but timer was reset)
      vi.advanceTimersByTime(3000);
      expect(mockFlushLogsBuffer).not.toHaveBeenCalled();

      // Advance time to complete the 5000ms after the second message
      vi.advanceTimersByTime(2000);
      expect(mockFlushLogsBuffer).toHaveBeenCalledTimes(1);
    });

    it('should handle parameterized strings with parameters', () => {
      logger.info(logger.fmt`Hello ${'John'}, your balance is ${100}`, { userId: 123 });
      expect(mockCaptureLog).toHaveBeenCalledWith(
        {
          level: 'info',
          message: expect.objectContaining({
            __sentry_template_string__: 'Hello %s, your balance is %s',
            __sentry_template_values__: ['John', 100],
          }),
          attributes: {
            userId: 123,
          },
        },
        expect.any(Object),
        undefined,
      );
    });

    it('should handle parameterized strings without additional attributes', () => {
      logger.debug(logger.fmt`User ${'Alice'} logged in from ${'mobile'}`);
      expect(mockCaptureLog).toHaveBeenCalledWith(
        {
          level: 'debug',
          message: expect.objectContaining({
            __sentry_template_string__: 'User %s logged in from %s',
            __sentry_template_values__: ['Alice', 'mobile'],
          }),
        },
        expect.any(Object),
        undefined,
      );
    });
  });
});
