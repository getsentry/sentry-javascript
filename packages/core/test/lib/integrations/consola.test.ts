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
  const actual = (await importOriginal()) as typeof import('../../../src/logs/utils');
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

      // Fallback: message = formatConsoleArgs(all args), template + parameters for args[1:]
      expect(formatConsoleArgs).toHaveBeenCalledWith(['Hello', 'world', 123, { key: 'value' }], 3, 1000);
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toContain('Hello');
      expect(captureCall.message).toContain('world');
      expect(captureCall.message).toContain('123');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['sentry.message.template']).toBe('Hello {} {} {}');
      expect(captureCall.attributes['sentry.message.parameter.0']).toBe('world');
      expect(captureCall.attributes['sentry.message.parameter.1']).toBe(123);
      expect(captureCall.attributes['sentry.message.parameter.2']).toEqual({ key: 'value' });
      expect(captureCall.attributes.key).toBeUndefined();
    });

    it('should handle args with unparseable objects', () => {
      const circular: any = {};
      circular.self = circular;

      const logObj = {
        type: 'info',
        args: ['Message', circular],
      };

      sentryReporter.log(logObj);

      expect(formatConsoleArgs).toHaveBeenCalledWith(['Message', circular], 3, 1000);
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toContain('Message');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['sentry.message.template']).toBe('Message {}');
      expect(captureCall.attributes['sentry.message.parameter.0']).toEqual({ self: '[Circular ~]' });
    });

    it('should extract multiple objects as attributes', () => {
      const logObj = {
        type: 'info',
        message: 'User action',
        args: [{ userId: 123 }, { sessionId: 'abc-123' }],
      };

      sentryReporter.log(logObj);

      // Object-first: first arg is object, second is object so message from consolaMessage, remainingArgs = [args[1]]
      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'User action',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'info',
          userId: 123,
          'sentry.message.parameter.0': { sessionId: 'abc-123' },
        },
      });
    });

    it('should handle mixed primitives and objects in args', () => {
      const logObj = {
        type: 'info',
        args: ['Processing', { userId: 456 }, 'for', { action: 'login' }],
      };

      sentryReporter.log(logObj);

      // Fallback: first arg is string, message = formatConsoleArgs(all), template + params
      expect(formatConsoleArgs).toHaveBeenCalledWith(
        ['Processing', { userId: 456 }, 'for', { action: 'login' }],
        3,
        1000,
      );
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toContain('Processing');
      expect(captureCall.message).toContain('for');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['sentry.message.template']).toBe('Processing {} {} {}');
      expect(captureCall.attributes['sentry.message.parameter.0']).toEqual({ userId: 456 });
      expect(captureCall.attributes['sentry.message.parameter.1']).toBe('for');
      expect(captureCall.attributes['sentry.message.parameter.2']).toEqual({ action: 'login' });
      expect(captureCall.attributes.userId).toBeUndefined();
      expect(captureCall.attributes.action).toBeUndefined();
    });

    it('should handle arrays as context attributes', () => {
      const logObj = {
        type: 'info',
        message: 'Array data',
        args: [[1, 2, 3]],
      };

      sentryReporter.log(logObj);

      // Fallback: first arg is array, message = formatConsoleArgs(all), no template (single arg)
      expect(formatConsoleArgs).toHaveBeenCalledWith([[1, 2, 3]], 3, 1000);
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toMatch(/1.*2.*3/);
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['consola.type']).toBe('info');
    });

    it('should not override existing attributes with object properties', () => {
      const logObj = {
        type: 'info',
        message: 'Test',
        tag: 'api',
        args: [{ tag: 'should-not-override' }],
      };

      sentryReporter.log(logObj);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'Test',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'info',
          'consola.tag': 'api',
          // tag should not be overridden by the object arg
        },
      });
    });

    it('should handle objects with nested properties', () => {
      const logObj = {
        type: 'info',
        args: ['Event', { user: { id: 123, name: 'John' }, timestamp: Date.now() }],
      };

      sentryReporter.log(logObj);

      // Fallback: first arg string, message = formatConsoleArgs(all), template + param
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toContain('Event');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['sentry.message.template']).toBe('Event {}');
      expect(captureCall.attributes['sentry.message.parameter.0']).toEqual({
        user: { id: 123, name: 'John' },
        timestamp: expect.any(Number),
      });
      expect(captureCall.attributes.user).toBeUndefined();
    });

    it('should respect normalizeDepth when extracting object properties', () => {
      const logObj = {
        type: 'info',
        args: [
          'Deep object',
          {
            level1: {
              level2: {
                level3: {
                  level4: { level5: 'should be normalized' }, // beause of normalizeDepth=3
                },
              },
            },
            simpleKey: 'simple value',
          },
        ],
      };

      sentryReporter.log(logObj);

      // Fallback: first arg is string, so template + param; param is normalized
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toContain('Deep object');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['sentry.message.template']).toBe('Deep object {}');
      expect(captureCall.attributes['sentry.message.parameter.0']).toEqual({
        level1: { level2: { level3: '[Object]' } },
        simpleKey: 'simple value',
      });
    });

    it('should store Date objects as context attributes', () => {
      const now = new Date('2023-01-01T00:00:00.000Z');
      const logObj = {
        type: 'info',
        args: ['Current time:', now],
      };

      sentryReporter.log(logObj);

      // Fallback: template + param (param is normalized, so Date becomes ISO string)
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toContain('Current time:');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['sentry.message.template']).toBe('Current time: {}');
      expect(captureCall.attributes['sentry.message.parameter.0']).toBe('2023-01-01T00:00:00.000Z');
    });

    it('should store Error objects as context attributes', () => {
      const error = new Error('Test error');
      const logObj = {
        type: 'error',
        args: ['Error occurred:', error],
      };

      sentryReporter.log(logObj);

      // Fallback: template + param (param is normalized, so Error becomes serialized object)
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('error');
      expect(captureCall.message).toContain('Error occurred:');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['sentry.message.template']).toBe('Error occurred: {}');
      expect(captureCall.attributes['sentry.message.parameter.0']).toMatchObject({
        message: 'Test error',
        name: 'Error',
      });
    });

    it('should store RegExp objects as context attributes', () => {
      const pattern = /test/gi;
      const logObj = {
        type: 'info',
        args: ['Pattern:', pattern],
      };

      sentryReporter.log(logObj);

      // Fallback: template + param (param is normalized, RegExp becomes empty object)
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toContain('Pattern:');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['sentry.message.template']).toBe('Pattern: {}');
      expect(captureCall.attributes['sentry.message.parameter.0']).toEqual({});
    });

    it('should store Map and Set objects as context attributes', () => {
      const map = new Map([
        ['key', 'value'],
        ['foo', 'bar'],
      ]);
      const set = new Set([1, 2, 3]);
      const logObj = {
        type: 'info',
        args: ['Collections:', map, set],
      };

      sentryReporter.log(logObj);

      // Fallback: template + params (normalized: Map/Set may become {} and [] depending on normalize)
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toContain('Collections:');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['sentry.message.template']).toBe('Collections: {} {}');
      expect(captureCall.attributes['sentry.message.parameter.0']).toBeDefined();
      expect(captureCall.attributes['sentry.message.parameter.1']).toBeDefined();
      // normalize() may convert Map to object and Set to array, or both to {} depending on implementation
      expect([{ key: 'value', foo: 'bar' }, {}]).toContainEqual(captureCall.attributes['sentry.message.parameter.0']);
      expect([[1, 2, 3], [], {}]).toContainEqual(captureCall.attributes['sentry.message.parameter.1']);
    });

    it('should only extract properties from plain objects', () => {
      const plainObj = { userId: 123, name: 'test' };
      const error = new Error('test');
      const logObj = {
        type: 'info',
        args: ['Mixed:', plainObj, error],
      };

      sentryReporter.log(logObj);

      // Fallback: first arg string, message = formatConsoleArgs(all), params for plainObj and error
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toContain('Mixed:');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['sentry.message.template']).toBe('Mixed: {} {}');
      expect(captureCall.attributes['sentry.message.parameter.0']).toEqual({ userId: 123, name: 'test' });
      expect(captureCall.attributes['sentry.message.parameter.1']).toMatchObject({
        message: 'test',
        name: 'Error',
      });
      expect(captureCall.attributes.userId).toBeUndefined();
      expect(captureCall.attributes.name).toBeUndefined();
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

  describe('structured object-first logging', () => {
    let sentryReporter: any;

    beforeEach(() => {
      sentryReporter = createConsolaReporter();
    });

    it('should extract object-first as attributes with string message', () => {
      const logObj = {
        type: 'info',
        args: [{ userId: 123, action: 'login' }, 'User logged in'],
      };

      sentryReporter.log(logObj);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'User logged in',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'info',
          userId: 123,
          action: 'login',
        },
      });
    });

    it('should extract object-first with no message (empty string)', () => {
      const logObj = {
        type: 'info',
        args: [{ userId: 456, status: 'active' }],
      };

      sentryReporter.log(logObj);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'info',
        message: '',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'info',
          userId: 456,
          status: 'active',
        },
      });
    });

    it('should handle object-first with additional parameters', () => {
      const requestId = 'req-123';
      const timestamp = 1234567890;
      const logObj = {
        type: 'info',
        args: [{ userId: 789 }, 'User action', requestId, timestamp],
      };

      sentryReporter.log(logObj);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'User action',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'info',
          userId: 789,
          'sentry.message.parameter.0': requestId,
          'sentry.message.parameter.1': timestamp,
        },
      });
    });

    it('should handle object-first with mixed parameter types', () => {
      const logObj = {
        type: 'info',
        args: [{ event: 'click' }, 'Button clicked', { buttonId: 'submit' }, 123, 'extra'],
      };

      sentryReporter.log(logObj);

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toBe('Button clicked');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes.event).toBe('click');
      expect(captureCall.attributes['sentry.message.parameter.0']).toEqual({ buttonId: 'submit' });
      expect(captureCall.attributes['sentry.message.parameter.1']).toBe(123);
      expect(captureCall.attributes['sentry.message.parameter.2']).toBe('extra');
    });

    it('should fall back to legacy mode when first arg is not plain object (string)', () => {
      const logObj = {
        type: 'info',
        args: ['Legacy log', { data: 1 }, 123],
      };

      sentryReporter.log(logObj);

      // Fallback: message = formatConsoleArgs(all), template + parameters
      expect(formatConsoleArgs).toHaveBeenCalledWith(['Legacy log', { data: 1 }, 123], 3, 1000);
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toContain('Legacy log');
      expect(captureCall.message).toContain('123');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['sentry.message.template']).toBe('Legacy log {} {}');
      expect(captureCall.attributes['sentry.message.parameter.0']).toEqual({ data: 1 });
      expect(captureCall.attributes['sentry.message.parameter.1']).toBe(123);
      expect(captureCall.attributes.data).toBeUndefined();
    });

    it('should fall back to legacy mode when first arg is array', () => {
      const logObj = {
        type: 'info',
        args: [[1, 2, 3], 'Array data'],
      };

      sentryReporter.log(logObj);

      // Fallback: first arg is array (not string), so no template/params; message = formatConsoleArgs(all)
      expect(formatConsoleArgs).toHaveBeenCalledWith([[1, 2, 3], 'Array data'], 3, 1000);
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toMatch(/1.*2.*3|Array data/);
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['sentry.message.template']).toBeUndefined();
    });

    it('should fall back to legacy mode when first arg is Error', () => {
      const error = new Error('Test error');
      const logObj = {
        type: 'error',
        args: [error, 'Error occurred'],
      };

      sentryReporter.log(logObj);

      expect(formatConsoleArgs).toHaveBeenCalled();
      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('error');
    });

    it('should normalize extracted attributes with normalizeDepth', () => {
      const logObj = {
        type: 'info',
        args: [
          {
            level1: {
              level2: {
                level3: {
                  level4: { level5: 'should be normalized' },
                },
              },
            },
            simpleKey: 'simple value',
          },
          'Deep object',
        ],
      };

      sentryReporter.log(logObj);

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.level).toBe('info');
      expect(captureCall.message).toBe('Deep object');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      // With normalizeDepth=3, we can see 3 levels deep from the normalized object
      expect(captureCall.attributes.level1).toEqual({ level2: { level3: '[Object]' } });
      expect(captureCall.attributes.simpleKey).toBe('simple value');
    });

    it('should not override sentry.origin and consola.* attributes', () => {
      const logObj = {
        type: 'info',
        tag: 'api',
        args: [{ 'sentry.origin': 'should-not-override', 'consola.tag': 'should-not-override' }, 'Test'],
      };

      sentryReporter.log(logObj);

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
      expect(captureCall.attributes['consola.tag']).toBe('api');
    });

    it('should handle object-first with non-string second argument', () => {
      const logObj = {
        type: 'info',
        args: [{ userId: 999 }, 123, 'other'],
      };

      sentryReporter.log(logObj);

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.message).toBe('');
      expect(captureCall.attributes.userId).toBe(999);
      expect(captureCall.attributes['sentry.message.parameter.0']).toBe(123);
      expect(captureCall.attributes['sentry.message.parameter.1']).toBe('other');
    });

    it('should handle empty object as first arg', () => {
      const logObj = {
        type: 'info',
        args: [{}, 'Empty object log'],
      };

      sentryReporter.log(logObj);

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.message).toBe('Empty object log');
      expect(captureCall.attributes['sentry.origin']).toBe('auto.log.consola');
    });

    it('should use object-first when first arg is plain object with "message" key', () => {
      // consola.log.raw({ message: "hello", userId: 123 }) or similar: first arg is object
      const logObj = {
        type: 'info',
        args: [{ message: 'hello', userId: 123 }],
      };

      sentryReporter.log(logObj);

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.message).toBe('');
      expect(captureCall.attributes.message).toBe('hello');
      expect(captureCall.attributes.userId).toBe(123);
    });

    it('should use object-first when first arg is plain object with "args" key', () => {
      const logObj = {
        type: 'info',
        args: [{ args: ['test'], userId: 456 }],
      };

      sentryReporter.log(logObj);

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.message).toBe('');
      expect(captureCall.attributes.args).toEqual(['test']);
      expect(captureCall.attributes.userId).toBe(456);
    });

    it('should use object-first when object has neither "message" nor "args" keys', () => {
      const logObj = {
        type: 'info',
        args: [{ userId: 789, action: 'click' }, 'Button clicked'],
      };

      sentryReporter.log(logObj);

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.message).toBe('Button clicked');
      expect(captureCall.attributes.userId).toBe(789);
      expect(captureCall.attributes.action).toBe('click');
    });

    it('should handle .raw() with object containing "message" key (object-first)', () => {
      // consola.log.raw({ message: "hello", userId: 456 }): object in args, object-first
      const logObj = {
        type: 'info',
        args: [{ message: 'hello', userId: 456 }],
      };

      sentryReporter.log(logObj);

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.message).toBe('');
      expect(captureCall.attributes.message).toBe('hello');
      expect(captureCall.attributes.userId).toBe(456);
    });

    it('should handle .raw() with object without "message"/"args" keys (object-first mode)', () => {
      // This simulates consola.log.raw({ userId: 123, action: "click" })
      // When using .raw() with a plain object that doesn't have special keys,
      // it should use object-first mode
      const logObj = {
        type: 'info',
        args: [{ userId: 123, action: 'click' }],
        // No message property - raw mode
      };

      sentryReporter.log(logObj);

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      // Object-first mode: first object becomes attributes, no message
      expect(captureCall.message).toBe('');
      expect(captureCall.attributes.userId).toBe(123);
      expect(captureCall.attributes.action).toBe('click');
    });

    it('should handle .raw() with object and additional string (object-first mode with message)', () => {
      // This simulates consola.log.raw({ userId: 999 }, "Custom message")
      const logObj = {
        type: 'info',
        args: [{ userId: 999, status: 'active' }, 'Custom message'],
        // No message property - raw mode
      };

      sentryReporter.log(logObj);

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      // Object-first mode: first object becomes attributes, second arg is message
      expect(captureCall.message).toBe('Custom message');
      expect(captureCall.attributes.userId).toBe(999);
      expect(captureCall.attributes.status).toBe('active');
    });

    it('should handle consola-merged object (extra keys on logObj, args = single string)', () => {
      // consola.log({ message: "inline-message", userId: 123, action: "login" }) → consola merges:
      // args: ["inline-message"], and userId, action on logObj
      const logObj = {
        type: 'log',
        level: 2,
        args: ['inline-message'],
        userId: 123,
        action: 'login',
        time: '2026-02-24T09:32:12.603Z',
      };

      sentryReporter.log(logObj);

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.message).toBe('inline-message');
      expect(captureCall.attributes.userId).toBe(123);
      expect(captureCall.attributes.action).toBe('login');
      expect(captureCall.attributes.time).toBe('2026-02-24T09:32:12.603Z');
      expect(captureCall.attributes['sentry.message.parameter.0']).toBeUndefined();
    });

    it('should use fallback when args is single string and no extra keys', () => {
      // consola.log({ message: "hello" }) → consola gives args: ["hello"], no extra keys
      const logObj = {
        type: 'log',
        args: ['hello'],
      };

      sentryReporter.log(logObj);

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.message).toBe('hello');
      expect(captureCall.attributes['sentry.message.template']).toBeUndefined();
    });
  });

  describe('custom extractAttributes option', () => {
    it('should use custom extraction when provided', () => {
      const customReporter = createConsolaReporter({
        extractAttributes: args => {
          if (args[0] === 'CUSTOM') {
            return {
              attributes: { customExtraction: true },
              message: 'Custom message',
              remainingArgs: [], // All args consumed
            };
          }
          return null;
        },
      });

      customReporter.log({
        type: 'info',
        args: ['CUSTOM', 'ignored'],
      });

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'Custom message',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'info',
          customExtraction: true,
        },
      });
    });

    it('should fall back to default when custom returns null', () => {
      const customReporter = createConsolaReporter({
        extractAttributes: () => null,
      });

      customReporter.log({
        type: 'info',
        args: [{ userId: 123 }, 'Fallback to default'],
      });

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'Fallback to default',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'info',
          userId: 123,
        },
      });
    });

    it('should handle custom extraction returning only attributes', () => {
      const customReporter = createConsolaReporter({
        extractAttributes: args => ({
          attributes: { custom: args[0] },
        }),
      });

      customReporter.log({
        type: 'info',
        args: ['test-value'],
      });

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.message).toBe('');
      expect(captureCall.attributes.custom).toBe('test-value');
    });

    it('should handle custom extraction returning only message', () => {
      const customReporter = createConsolaReporter({
        extractAttributes: args => ({
          message: `Formatted: ${args[0]}`,
        }),
      });

      customReporter.log({
        type: 'info',
        args: ['test'],
      });

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.message).toBe('Formatted: test');
    });

    it('should handle custom extraction with empty remainingArgs', () => {
      const customReporter = createConsolaReporter({
        extractAttributes: args => ({
          attributes: { allConsumed: true },
          message: String(args[0]),
          remainingArgs: [],
        }),
      });

      customReporter.log({
        type: 'info',
        args: ['value', 'extra'],
      });

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.message).toBe('value');
      expect(captureCall.attributes.allConsumed).toBe(true);
      expect(captureCall.attributes['sentry.message.parameter.0']).toBeUndefined();
    });

    it('should use consolaMessage if custom extraction does not provide message', () => {
      const customReporter = createConsolaReporter({
        extractAttributes: _args => ({
          attributes: { custom: true },
        }),
      });

      customReporter.log({
        type: 'info',
        message: 'From consola',
        args: ['ignored'],
      });

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.message).toBe('From consola');
      expect(captureCall.attributes.custom).toBe(true);
    });

    it('should handle custom extraction with circular references in remainingArgs', () => {
      const circular: any = { self: null };
      circular.self = circular;

      const customReporter = createConsolaReporter({
        extractAttributes: _args => ({
          message: 'Test',
          remainingArgs: [circular],
        }),
      });

      customReporter.log({
        type: 'info',
        args: ['value'],
      });

      const captureCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0][0];
      expect(captureCall.message).toBe('Test');
      expect(captureCall.attributes['sentry.message.parameter.0']).toEqual({ self: '[Circular ~]' });
    });
  });
});
