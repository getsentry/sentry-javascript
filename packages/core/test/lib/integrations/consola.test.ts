import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient, getCurrentScope } from '../../../src/currentScopes';
import { createConsolaReporter } from '../../../src/integrations/consola';
import { _INTERNAL_captureLog } from '../../../src/logs/internal';
import { formatConsoleArgs } from '../../../src/logs/utils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

// Mock dependencies
vi.mock('../../../src/logs/internal', () => ({
  _INTERNAL_captureLog: vi.fn(),
  _INTERNAL_flushLogsBuffer: vi.fn(),
}));

vi.mock('../../../src/logs/utils', async actual => ({
  formatConsoleArgs: vi.fn(((await actual()) as any).formatConsoleArgs),
}));

vi.mock('../../../src/currentScopes', () => ({
  getClient: vi.fn(),
  getCurrentScope: vi.fn(),
}));

describe('createConsolaReporter', () => {
  let mockClient: TestClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a test client with enableLogs: true
    mockClient = new TestClient({
      ...getDefaultTestClientOptions({ dsn: 'https://username@domain/123' }),
      enableLogs: true,
      normalizeDepth: 3,
      normalizeMaxBreadth: 1000,
    });

    const mockScope = {
      getClient: vi.fn().mockReturnValue(mockClient),
    };

    vi.mocked(getClient).mockReturnValue(mockClient);
    vi.mocked(getCurrentScope).mockReturnValue(mockScope as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('reporter creation', () => {
    it('should create a reporter with log function', () => {
      const reporter = createConsolaReporter();

      expect(reporter).toEqual({
        log: expect.any(Function),
      });
    });
  });

  describe('log capturing', () => {
    let sentryReporter: any;

    beforeEach(() => {
      sentryReporter = createConsolaReporter();
    });

    it('should capture error logs', () => {
      const logObj = {
        type: 'error',
        level: 0,
        message: 'This is an error',
        tag: 'test',
        date: new Date('2023-01-01T00:00:00.000Z'),
      };

      sentryReporter.log(logObj);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'error',
        message: 'This is an error',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.tag': 'test',
          'consola.type': 'error',
          'consola.level': 0,
        },
      });
    });

    it('should capture warn logs', () => {
      const logObj = {
        type: 'warn',
        message: 'This is a warning',
      };

      sentryReporter.log(logObj);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'warn',
        message: 'This is a warning',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'warn',
        },
      });
    });

    it('should capture info logs', () => {
      const logObj = {
        type: 'info',
        message: 'This is info',
      };

      sentryReporter.log(logObj);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'This is info',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'info',
        },
      });
    });

    it('should capture debug logs', () => {
      const logObj = {
        type: 'debug',
        message: 'Debug message',
      };

      sentryReporter.log(logObj);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'debug',
        message: 'Debug message',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'debug',
        },
      });
    });

    it('should capture trace logs', () => {
      const logObj = {
        type: 'trace',
        message: 'Trace message',
      };

      sentryReporter.log(logObj);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'trace',
        message: 'Trace message',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'trace',
        },
      });
    });

    it('should capture fatal logs', () => {
      const logObj = {
        type: 'fatal',
        message: 'Fatal error',
      };

      sentryReporter.log(logObj);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'fatal',
        message: 'Fatal error',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'fatal',
        },
      });
    });

    it('should format message from args when message is not provided', () => {
      const logObj = {
        type: 'info',
        args: ['Hello', 'world', 123, { key: 'value' }],
      };

      sentryReporter.log(logObj);

      expect(formatConsoleArgs).toHaveBeenCalledWith(['Hello', 'world', 123, { key: 'value' }], 3, 1000);
      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'Hello world 123 {"key":"value"}',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'info',
        },
      });
    });

    it('should handle args with unparseable objects', () => {
      const circular: any = {};
      circular.self = circular;

      const logObj = {
        type: 'info',
        args: ['Message', circular],
      };

      sentryReporter.log(logObj);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'Message {"self":"[Circular ~]"}',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'info',
        },
      });
    });

    it('should map consola levels to sentry levels when type is not provided', () => {
      const logObj = {
        level: 0, // Fatal level
        message: 'Fatal message',
      };

      sentryReporter.log(logObj);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'fatal',
        message: 'Fatal message',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.level': 0,
        },
      });
    });

    it('should map various consola types correctly', () => {
      const testCases = [
        { type: 'success', expectedLevel: 'info' },
        { type: 'fail', expectedLevel: 'error' },
        { type: 'ready', expectedLevel: 'info' },
        { type: 'start', expectedLevel: 'info' },
        { type: 'verbose', expectedLevel: 'debug' },
        { type: 'log', expectedLevel: 'info' },
        { type: 'silent', expectedLevel: 'trace' },
      ];

      testCases.forEach(({ type, expectedLevel }) => {
        vi.clearAllMocks();

        sentryReporter.log({
          type,
          message: `Test ${type} message`,
        });

        expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
          level: expectedLevel,
          message: `Test ${type} message`,
          attributes: {
            'sentry.origin': 'auto.log.consola',
            'consola.type': type,
          },
        });
      });
    });
  });

  describe('level filtering', () => {
    it('should only capture specified levels', () => {
      const filteredReporter = createConsolaReporter({
        levels: ['error', 'warn'],
      });

      // Should capture error
      filteredReporter.log({
        type: 'error',
        message: 'Error message',
      });
      expect(_INTERNAL_captureLog).toHaveBeenCalledTimes(1);

      // Should capture warn
      filteredReporter.log({
        type: 'warn',
        message: 'Warn message',
      });
      expect(_INTERNAL_captureLog).toHaveBeenCalledTimes(2);

      // Should not capture info
      filteredReporter.log({
        type: 'info',
        message: 'Info message',
      });
      expect(_INTERNAL_captureLog).toHaveBeenCalledTimes(2);
    });

    it('should use default levels when none specified', () => {
      const defaultReporter = createConsolaReporter();

      // Should capture all default levels
      ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].forEach(type => {
        defaultReporter.log({
          type,
          message: `${type} message`,
        });
      });

      expect(_INTERNAL_captureLog).toHaveBeenCalledTimes(6);
    });
  });
});
