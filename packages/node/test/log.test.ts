import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as sentryCore from '@sentry/core';
import * as nodeLogger from '../src/log';

// Mock the core functions
vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    _INTERNAL_captureLog: vi.fn(),
  };
});

describe('Node Logger', () => {
  // Use the mocked function
  const mockCaptureLog = vi.mocked(sentryCore._INTERNAL_captureLog);

  beforeEach(() => {
    // Reset mocks
    mockCaptureLog.mockClear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Basic logging methods', () => {
    it('should export all log methods', () => {
      expect(nodeLogger.trace).toBeTypeOf('function');
      expect(nodeLogger.debug).toBeTypeOf('function');
      expect(nodeLogger.info).toBeTypeOf('function');
      expect(nodeLogger.warn).toBeTypeOf('function');
      expect(nodeLogger.error).toBeTypeOf('function');
      expect(nodeLogger.fatal).toBeTypeOf('function');
    });

    it('should call _INTERNAL_captureLog with trace level', () => {
      nodeLogger.trace('Test trace message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'trace',
        message: 'Test trace message',
        attributes: { key: 'value' },
      });
    });

    it('should call _INTERNAL_captureLog with debug level', () => {
      nodeLogger.debug('Test debug message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'debug',
        message: 'Test debug message',
        attributes: { key: 'value' },
      });
    });

    it('should call _INTERNAL_captureLog with info level', () => {
      nodeLogger.info('Test info message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'Test info message',
        attributes: { key: 'value' },
      });
    });

    it('should call _INTERNAL_captureLog with warn level', () => {
      nodeLogger.warn('Test warn message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'warn',
        message: 'Test warn message',
        attributes: { key: 'value' },
      });
    });

    it('should call _INTERNAL_captureLog with error level', () => {
      nodeLogger.error('Test error message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'error',
        message: 'Test error message',
        attributes: { key: 'value' },
      });
    });

    it('should call _INTERNAL_captureLog with fatal level', () => {
      nodeLogger.fatal('Test fatal message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'fatal',
        message: 'Test fatal message',
        attributes: { key: 'value' },
      });
    });
  });

  describe('Template string logging', () => {
    it('should handle template strings with parameters', () => {
      nodeLogger.info('Hello %s, your balance is %d', ['John', 100], { userId: 123 });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'Hello John, your balance is 100',
        attributes: {
          userId: 123,
          'sentry.message.template': 'Hello %s, your balance is %d',
          'sentry.message.param.0': 'John',
          'sentry.message.param.1': 100,
        },
      });
    });

    it('should handle template strings without additional attributes', () => {
      nodeLogger.debug('User %s logged in from %s', ['Alice', 'mobile']);
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'debug',
        message: 'User Alice logged in from mobile',
        attributes: {
          'sentry.message.template': 'User %s logged in from %s',
          'sentry.message.param.0': 'Alice',
          'sentry.message.param.1': 'mobile',
        },
      });
    });

    it('should handle parameterized strings with parameters', () => {
      nodeLogger.info(nodeLogger.fmt`Hello ${'John'}, your balance is ${100}`, { userId: 123 });
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
      nodeLogger.debug(nodeLogger.fmt`User ${'Alice'} logged in from ${'mobile'}`);
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'debug',
        message: expect.objectContaining({
          __sentry_template_string__: 'User %s logged in from %s',
          __sentry_template_values__: ['Alice', 'mobile'],
        }),
      });
    });
  });
});
