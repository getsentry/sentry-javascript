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
      expect(nodeLogger.critical).toBeTypeOf('function');
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

    it('should call _INTERNAL_captureLog with critical level', () => {
      nodeLogger.critical('Test critical message', { key: 'value' });
      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'critical',
        message: 'Test critical message',
        attributes: { key: 'value' },
      });
    });
  });

  describe('Formatted logging methods', () => {
    it('should export all formatted log methods', () => {
      expect(nodeLogger.traceFmt).toBeTypeOf('function');
      expect(nodeLogger.debugFmt).toBeTypeOf('function');
      expect(nodeLogger.infoFmt).toBeTypeOf('function');
      expect(nodeLogger.warnFmt).toBeTypeOf('function');
      expect(nodeLogger.errorFmt).toBeTypeOf('function');
      expect(nodeLogger.fatalFmt).toBeTypeOf('function');
      expect(nodeLogger.criticalFmt).toBeTypeOf('function');
    });

    it('should format the message with trace level', () => {
      nodeLogger.traceFmt('Hello %s', ['world'], { key: 'value' });

      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'trace',
        message: 'Hello world',
        attributes: {
          key: 'value',
          'sentry.message.template': 'Hello %s',
          'sentry.message.param.0': 'world',
        },
      });
    });

    it('should format the message with debug level', () => {
      nodeLogger.debugFmt('Count: %d', [42], { key: 'value' });

      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'debug',
        message: 'Count: 42',
        attributes: {
          key: 'value',
          'sentry.message.template': 'Count: %d',
          'sentry.message.param.0': 42,
        },
      });
    });

    it('should format the message with info level', () => {
      nodeLogger.infoFmt('User %s logged in from %s', ['John', 'Paris'], { userId: 123 });

      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'User John logged in from Paris',
        attributes: {
          userId: 123,
          'sentry.message.template': 'User %s logged in from %s',
          'sentry.message.param.0': 'John',
          'sentry.message.param.1': 'Paris',
        },
      });
    });

    it('should format the message with warn level', () => {
      nodeLogger.warnFmt('Usage at %d%%', [95], { resource: 'CPU' });

      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'warn',
        message: 'Usage at 95%',
        attributes: {
          resource: 'CPU',
          'sentry.message.template': 'Usage at %d%%',
          'sentry.message.param.0': 95,
        },
      });
    });

    it('should format the message with error level', () => {
      nodeLogger.errorFmt('Failed to process %s: %s', ['payment', 'timeout'], { orderId: 'ORD-123' });

      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'error',
        message: 'Failed to process payment: timeout',
        attributes: {
          orderId: 'ORD-123',
          'sentry.message.template': 'Failed to process %s: %s',
          'sentry.message.param.0': 'payment',
          'sentry.message.param.1': 'timeout',
        },
      });
    });

    it('should format the message with fatal level', () => {
      nodeLogger.fatalFmt('System crash in module %s', ['auth'], { shutdown: true });

      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'fatal',
        message: 'System crash in module auth',
        attributes: {
          shutdown: true,
          'sentry.message.template': 'System crash in module %s',
          'sentry.message.param.0': 'auth',
        },
      });
    });

    it('should format the message with critical level', () => {
      nodeLogger.criticalFmt('Database %s is down for %d minutes', ['customers', 30], { impact: 'high' });

      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'critical',
        message: 'Database customers is down for 30 minutes',
        attributes: {
          impact: 'high',
          'sentry.message.template': 'Database %s is down for %d minutes',
          'sentry.message.param.0': 'customers',
          'sentry.message.param.1': 30,
        },
      });
    });

    it('should handle complex formatting with multiple types', () => {
      const obj = { name: 'test' };
      nodeLogger.infoFmt('Values: %s, %d, %j', ['string', 42, obj]);

      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'info',
        message: `Values: string, 42, ${JSON.stringify(obj)}`,
        attributes: {
          'sentry.message.template': 'Values: %s, %d, %j',
          'sentry.message.param.0': 'string',
          'sentry.message.param.1': 42,
          'sentry.message.param.2': obj,
        },
      });
    });

    it('should use empty object as default for attributes', () => {
      nodeLogger.infoFmt('Hello %s', ['world']);

      expect(mockCaptureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'Hello world',
        attributes: {
          'sentry.message.template': 'Hello %s',
          'sentry.message.param.0': 'world',
        },
      });
    });
  });
});
