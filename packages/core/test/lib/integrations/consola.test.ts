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

vi.mock('../../../src/logs/utils', async importOriginal => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual: typeof import('../../../src/logs/utils') = await importOriginal();
  return {
    ...actual,
    formatConsoleArgs: vi.fn(actual.formatConsoleArgs),
  };
});

vi.mock('../../../src/currentScopes', () => ({
  getClient: vi.fn(),
  getCurrentScope: vi.fn(),
}));

describe('createConsolaReporter', () => {
  let mockClient: TestClient;
  let sentryReporter: ReturnType<typeof createConsolaReporter>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a test client with enableLogs: true
    mockClient = new TestClient({
      ...getDefaultTestClientOptions({ dsn: 'https://username@domain/123' }),
      enableLogs: true,
      normalizeDepth: 3,
      normalizeMaxBreadth: 1000,
    });

    vi.mocked(getClient).mockReturnValue(mockClient);
    vi.mocked(getCurrentScope).mockReturnValue({
      getClient: vi.fn().mockReturnValue(mockClient),
    } as any);
    sentryReporter = createConsolaReporter();
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

  describe('message and args handling', () => {
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
  });

  describe('level mapping', () => {
    it.each([
      ['error', 'error'],
      ['warn', 'warn'],
      ['info', 'info'],
      ['debug', 'debug'],
      ['trace', 'trace'],
      ['fatal', 'fatal'],
    ] as const)('maps type "%s" to Sentry level "%s"', (type, expectedLevel) => {
      sentryReporter.log({ type, args: [`${type} message`] });

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: expectedLevel,
          message: `${type} message`,
          attributes: expect.objectContaining({ 'consola.type': type, 'sentry.origin': 'auto.log.consola' }),
        }),
      );
    });

    it.each([
      ['success', 'info'],
      ['fail', 'error'],
      ['ready', 'info'],
      ['start', 'info'],
      ['verbose', 'debug'],
      ['log', 'info'],
      ['silent', 'trace'],
    ] as const)('maps consola type "%s" to Sentry level "%s"', (type, expectedLevel) => {
      sentryReporter.log({ type, args: [`Test ${type}`] });

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: expectedLevel,
          message: `Test ${type}`,
          attributes: expect.objectContaining({
            'consola.type': type,
            'sentry.origin': 'auto.log.consola',
          }),
        }),
      );
    });

    it('uses level number when type is missing', () => {
      sentryReporter.log({
        level: 0, // Fatal level
        args: ['Fatal message'],
      });

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'fatal',
          message: 'Fatal message',
          attributes: expect.objectContaining({
            'consola.level': 0,
            'sentry.origin': 'auto.log.consola',
          }),
        }),
      );
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
        args: ['Error message'],
      });
      expect(_INTERNAL_captureLog).toHaveBeenCalledTimes(1);

      // Should capture warn
      filteredReporter.log({
        type: 'warn',
        args: ['Warn message'],
      });
      expect(_INTERNAL_captureLog).toHaveBeenCalledTimes(2);

      // Should not capture info
      filteredReporter.log({
        type: 'info',
        args: ['Info message'],
      });
      expect(_INTERNAL_captureLog).toHaveBeenCalledTimes(2);
    });

    it('should use default levels when none specified', () => {
      const defaultReporter = createConsolaReporter();

      // Should capture all default levels
      ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].forEach(type => {
        defaultReporter.log({
          type,
          args: [`${type} message`],
        });
      });

      expect(_INTERNAL_captureLog).toHaveBeenCalledTimes(6);
    });
  });

  describe('message and args handling', () => {
    it('consola-merged: args=[message] with extra keys on log object', () => {
      sentryReporter.log({
        type: 'log',
        level: 2,
        args: ['Hello', 'world', { some: 'obj' }],
        userId: 123,
        action: 'login',
        time: '2026-02-24T10:24:04.477Z',
        smallObj: { firstLevel: { secondLevel: { thirdLevel: { fourthLevel: 'deep' } } } },
        tag: '',
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];

      // Message from args
      expect(call.message).toBe('Hello world {"some":"obj"}');
      expect(call.attributes).toMatchObject({
        'consola.type': 'log',
        'consola.level': 2,
        userId: 123,
        smallObj: { firstLevel: { secondLevel: { thirdLevel: '[Object]' } } }, // Object is normalized
        action: 'login',
        time: '2026-02-24T10:24:04.477Z',
        'sentry.origin': 'auto.log.consola',
      });
      expect(call.attributes?.['sentry.message.parameter.0']).toBeUndefined();
    });

    it('capturing custom keys mimicking `log({ message: "", ... })` or direct reporter.log({ type, message, userId, sessionId })', () => {
      sentryReporter.log({
        type: 'info',
        message: 'User action',
        userId: 123,
        sessionId: 'abc-123',
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('User action');
      expect(call.attributes).toMatchObject({
        'consola.type': 'info',
        userId: 123,
        sessionId: 'abc-123',
      });
    });
  });
});
