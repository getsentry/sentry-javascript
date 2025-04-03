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
    });

    it('should call _INTERNAL_captureLog with trace level', () => {
      logger.trace('Test trace message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'trace',
        message: 'Test trace message',
        attributes: { key: 'value' },
        severityNumber: undefined,
      });
    });

    it('should call _INTERNAL_captureLog with debug level', () => {
      logger.debug('Test debug message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'debug',
        message: 'Test debug message',
        attributes: { key: 'value' },
        severityNumber: undefined,
      });
    });

    it('should call _INTERNAL_captureLog with info level', () => {
      logger.info('Test info message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'Test info message',
        attributes: { key: 'value' },
        severityNumber: undefined,
      });
    });

    it('should call _INTERNAL_captureLog with warn level', () => {
      logger.warn('Test warn message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'warn',
        message: 'Test warn message',
        attributes: { key: 'value' },
        severityNumber: undefined,
      });
    });

    it('should call _INTERNAL_captureLog with error level', () => {
      logger.error('Test error message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'error',
        message: 'Test error message',
        attributes: { key: 'value' },
        severityNumber: undefined,
      });
    });

    it('should call _INTERNAL_captureLog with fatal level', () => {
      logger.fatal('Test fatal message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'fatal',
        message: 'Test fatal message',
        attributes: { key: 'value' },
        severityNumber: undefined,
      });
    });
  });

  it('should handle parameterized strings with parameters', () => {
    logger.info(logger.fmt`Hello ${'John'}, your balance is ${100}`, { userId: 123 });
    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info',
      message: expect.objectContaining({
        __sentry_template_string__: 'Hello %s, your balance is %s',
        __sentry_template_values__: ['John', 100],
      }),
      attributes: {
        userId: 123,
      },
    });
  });

  it('should handle parameterized strings without additional attributes', () => {
    logger.debug(logger.fmt`User ${'Alice'} logged in from ${'mobile'}`);
    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'debug',
      message: expect.objectContaining({
        __sentry_template_string__: 'User %s logged in from %s',
        __sentry_template_values__: ['Alice', 'mobile'],
      }),
    });
  });
});
