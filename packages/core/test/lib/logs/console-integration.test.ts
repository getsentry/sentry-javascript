import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../../../src/currentScopes';
import { consoleLoggingIntegration } from '../../../src/logs/console-integration';
import { _INTERNAL_captureLog } from '../../../src/logs/internal';
import { formatConsoleArgs } from '../../../src/logs/utils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

vi.mock('../../../src/logs/internal', () => ({
  _INTERNAL_captureLog: vi.fn(),
  _INTERNAL_flushLogsBuffer: vi.fn(),
}));

vi.mock('../../../src/logs/utils', async importOriginal => {
  // oxlint-disable-next-line typescript/consistent-type-imports
  const actual: typeof import('../../../src/logs/utils') = await importOriginal();
  return {
    ...actual,
    formatConsoleArgs: vi.fn(actual.formatConsoleArgs),
  };
});

let consoleHandler: (data: { args: unknown[]; level: string }) => void;

vi.mock('../../../src/instrument/console', () => ({
  addConsoleInstrumentationHandler: vi.fn(handler => {
    consoleHandler = handler;
    return () => {};
  }),
}));

vi.mock('../../../src/currentScopes', () => ({
  getClient: vi.fn(),
}));

function triggerConsole(level: string, ...args: unknown[]): void {
  consoleHandler({ args, level });
}

describe('consoleLoggingIntegration', () => {
  let client: TestClient;

  beforeEach(() => {
    vi.clearAllMocks();

    client = new TestClient({
      ...getDefaultTestClientOptions({ dsn: 'https://username@domain/123' }),
      enableLogs: true,
      normalizeDepth: 3,
      normalizeMaxBreadth: 1000,
    });

    vi.mocked(getClient).mockReturnValue(client);

    const integration = consoleLoggingIntegration();
    integration.setup!(client, true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('object-first: first argument is a plain object', () => {
    it('extracts object keys as attributes and uses second string arg as message', () => {
      triggerConsole('log', { userId: 100, action: 'login' }, 'User logged in');

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];

      expect(call.level).toBe('info');
      expect(call.message).toBe('{"userId":100,"action":"login"} User logged in');
      expect(call.attributes).toEqual(
        expect.objectContaining({
          'sentry.origin': 'auto.log.console',
          userId: 100,
          action: 'login',
        }),
      );
    });

    it('extracts object keys as attributes with no second arg', () => {
      triggerConsole('info', { event: 'click', count: 2 });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('{"event":"click","count":2}');
      expect(call.attributes).toEqual(
        expect.objectContaining({
          'sentry.origin': 'auto.log.console',
          event: 'click',
          count: 2,
        }),
      );
    });

    it('adds remaining args after second string as sentry.message.parameter.*', () => {
      triggerConsole('info', { userId: 123 }, 'User action', 'req-abc', 1234567890);

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('{"userId":123} User action req-abc 1234567890');
      expect(call.attributes).toEqual(
        expect.objectContaining({
          userId: 123,
          'sentry.origin': 'auto.log.console',
          'sentry.message.parameter.0': 'req-abc',
          'sentry.message.parameter.1': 1234567890,
        }),
      );
      expect(call.attributes).not.toHaveProperty('sentry.message.template');
    });

    it('treats all args after the object as parameters when second arg is not a string', () => {
      triggerConsole('info', { userId: 123 }, 42, { extra: 'data' });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('{"userId":123} 42 {"extra":"data"}');
      expect(call.attributes).toEqual(
        expect.objectContaining({
          userId: 123,
          'sentry.origin': 'auto.log.console',
          'sentry.message.parameter.0': 42,
          'sentry.message.parameter.1': { extra: 'data' },
        }),
      );
    });

    it('handles empty object as first arg', () => {
      triggerConsole('info', {}, 'Empty object log');

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('{} Empty object log');
      expect(call.attributes).toEqual(
        expect.objectContaining({
          'sentry.origin': 'auto.log.console',
        }),
      );
      expect(call.attributes).not.toHaveProperty('sentry.message.template');
    });

    it('normalizes deeply nested object attributes according to normalizeDepth', () => {
      triggerConsole('info', {
        level1: { level2: { level3: { level4: 'deep' } } },
        simpleKey: 'simple value',
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('{"level1":{"level2":{"level3":"[Object]"}},"simpleKey":"simple value"}');
      expect(call.attributes).toEqual(
        expect.objectContaining({
          level1: { level2: { level3: '[Object]' } },
          simpleKey: 'simple value',
        }),
      );
    });

    it('normalizes remaining parameters in object-first mode', () => {
      triggerConsole('info', { simpleKey: 'value' }, 'Deep object', 12345, {
        another: 'object',
        level1: { level2: { level3: { level4: 'deep' } } },
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe(
        '{"simpleKey":"value"} Deep object 12345 {"another":"object","level1":{"level2":{"level3":"[Object]"}}}',
      );
      expect(call.attributes).toEqual(
        expect.objectContaining({
          simpleKey: 'value',
          'sentry.message.parameter.0': 12345,
          'sentry.message.parameter.1': {
            another: 'object',
            level1: { level2: { level3: '[Object]' } },
          },
        }),
      );
    });

    it('does not add sentry.message.template in object-first mode', () => {
      triggerConsole('info', { key: 'val' }, 'message string', 'extra');

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('{"key":"val"} message string extra');
      expect(call.attributes).not.toHaveProperty('sentry.message.template');
    });

    it('extracts object with a "message" key as attributes', () => {
      triggerConsole('info', { message: 'user login', userId: 123, sessionId: 'sess-abc' });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('{"message":"user login","userId":123,"sessionId":"sess-abc"}');
      expect(call.attributes).toEqual(
        expect.objectContaining({
          message: 'user login',
          userId: 123,
          sessionId: 'sess-abc',
        }),
      );
    });
  });

  describe('fallback: first argument is not a plain object', () => {
    it('formats all args as message and adds template + parameters', () => {
      triggerConsole('info', 'Hello', 'world', 123, { key: 'value' });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('Hello world 123 {"key":"value"}');
      expect(call.attributes).toEqual(
        expect.objectContaining({
          'sentry.origin': 'auto.log.console',
          'sentry.message.template': 'Hello {} {} {}',
          'sentry.message.parameter.0': 'world',
          'sentry.message.parameter.1': 123,
          'sentry.message.parameter.2': { key: 'value' },
        }),
      );
    });

    it('does not extract object keys as attributes when first arg is a string', () => {
      triggerConsole('info', 'Normal log', { data: 1 }, 123);

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('Normal log {"data":1} 123');
      expect(call.attributes).not.toHaveProperty('data');
    });

    it('does not add template when first arg is the only arg', () => {
      triggerConsole('info', 'Solo message');

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('Solo message');
      expect(call.attributes).not.toHaveProperty('sentry.message.template');
      expect(call.attributes).not.toHaveProperty('sentry.message.parameter.0');
    });

    it('does not add template when first arg contains console substitution patterns', () => {
      triggerConsole('info', 'Value: %d, another: %s', 42, 'hello');

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('Value: %d, another: %s 42 hello');
      expect(call.attributes).not.toHaveProperty('sentry.message.template');
      expect(call.attributes).not.toHaveProperty('sentry.message.parameter.0');
    });

    it('does not treat arrays as objects for attribute extraction', () => {
      triggerConsole('info', [1, 2, 3], 'Array data');

      expect(formatConsoleArgs).toHaveBeenCalled();
      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('[1,2,3] Array data');
      // If arrays were treated as objects, their indices would leak as attribute keys ('0', '1', '2')
      expect(call.attributes).not.toHaveProperty('0');
    });

    it('does not generate template when first arg is a number', () => {
      triggerConsole('info', 42, 'is the answer');

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('42 is the answer');
      expect(call.attributes).toEqual({
        'sentry.origin': 'auto.log.console',
      });
    });

    // Errors are intentionally not treated as plain objects for attribute extraction.
    // Extracting Error properties (message, name, stack, cause, custom fields) as log attributes
    // would be complex and inconsistent. Only plain objects get structured extraction.
    it('does not extract Error properties as attributes when Error is first arg', () => {
      const err = new Error('Test error');
      triggerConsole('error', err, 'context info');

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toContain('Error: Test error');
      expect(call.message).toContain('context info');
      expect(call.attributes).not.toHaveProperty('message');
      expect(call.attributes).not.toHaveProperty('name');
    });

    it('normalizes Error objects into message parameters when Error is a trailing arg', () => {
      const err = new Error('connection refused');
      triggerConsole('error', 'Error occurred:', err);

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.attributes?.['sentry.message.parameter.0']).toMatchObject({
        message: 'connection refused',
        name: 'Error',
      });
    });

    it('normalizes parameter values in fallback mode', () => {
      triggerConsole('info', 'Deep', {
        level1: { level2: { level3: { level4: 'deep' } } },
        simpleKey: 'simple value',
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('Deep {"level1":{"level2":{"level3":"[Object]"}},"simpleKey":"simple value"}');
      expect(call.attributes).toEqual(
        expect.objectContaining({
          'sentry.message.parameter.0': {
            level1: { level2: { level3: '[Object]' } },
            simpleKey: 'simple value',
          },
        }),
      );
    });
  });

  describe('object-first vs fallback boundary', () => {
    it('treats JSON.stringify output as fallback (string first arg)', () => {
      const jsonStr = JSON.stringify({ some: 'structure', object: { foo: 2 } });
      triggerConsole('log', jsonStr);

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('{"some":"structure","object":{"foo":2}}');
      expect(call.attributes).not.toHaveProperty('some');
      expect(call.attributes).not.toHaveProperty('object');
    });

    it('treats a plain object as object-first', () => {
      triggerConsole('log', { some: 'structure', object: { foo: 1 } });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('{"some":"structure","object":{"foo":1}}');
      expect(call.attributes).toEqual(
        expect.objectContaining({
          some: 'structure',
          object: { foo: 1 },
        }),
      );
    });

    it('treats class instances as plain objects via isPlainObject', () => {
      class MyClass {
        public value = 42;
      }
      triggerConsole('info', new MyClass(), 'extra');

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toContain('extra');
      expect(call.attributes).toEqual(
        expect.objectContaining({
          value: 42,
        }),
      );
    });

    it('does not treat null as object-first', () => {
      triggerConsole('info', null, 'after null');

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.attributes).not.toHaveProperty('sentry.message.parameter.0');
      expect(call.message).toContain('null');
    });

    it('does not treat undefined as object-first', () => {
      triggerConsole('info', undefined, 'after undefined');

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toContain('undefined');
    });
  });

  describe('level mapping', () => {
    it('maps console.log to info with severityNumber 10', () => {
      triggerConsole('log', 'test message');

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          severityNumber: 10,
        }),
      );
    });

    it.each([
      ['debug', 'debug'],
      ['info', 'info'],
      ['warn', 'warn'],
      ['error', 'error'],
      ['trace', 'trace'],
    ] as const)('maps console.%s to %s', (consoleLevel, sentryLevel) => {
      triggerConsole(consoleLevel, `${consoleLevel} message`);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: sentryLevel,
          message: `${consoleLevel} message`,
        }),
      );
    });
  });

  describe('console.assert', () => {
    it('captures error log when assertion fails with no message', () => {
      triggerConsole('assert', false);

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: 'Assertion failed',
        }),
      );
    });

    it('captures error log with message when assertion fails', () => {
      triggerConsole('assert', false, 'expected true');

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.level).toBe('error');
      expect(call.message).toBe('Assertion failed: expected true');
    });

    it('does not capture when assertion passes', () => {
      triggerConsole('assert', true, 'should not appear');

      expect(_INTERNAL_captureLog).not.toHaveBeenCalled();
    });
  });

  describe('filtering', () => {
    it('only captures configured levels', () => {
      const filteredClient = new TestClient({
        ...getDefaultTestClientOptions({ dsn: 'https://username@domain/123' }),
        enableLogs: true,
      });
      vi.mocked(getClient).mockReturnValue(filteredClient);

      const integration = consoleLoggingIntegration({ levels: ['error', 'warn'] });
      integration.setup!(filteredClient, true);

      triggerConsole('error', 'captured');
      expect(_INTERNAL_captureLog).toHaveBeenCalledTimes(1);

      triggerConsole('info', 'not captured');
      expect(_INTERNAL_captureLog).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('handles circular references in object-first mode', () => {
      const circular: Record<string, unknown> = { key: 'value' };
      circular.self = circular;

      triggerConsole('info', circular);

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('{"key":"value","self":"[Circular ~]"}');
      expect(call.attributes).toEqual(
        expect.objectContaining({
          key: 'value',
          self: '[Circular ~]',
        }),
      );
    });

    it('handles circular references in fallback message parameters', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      triggerConsole('info', 'Message', circular);

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('Message {"self":"[Circular ~]"}');
      expect(call.attributes).toEqual(
        expect.objectContaining({
          'sentry.message.template': 'Message {}',
          'sentry.message.parameter.0': { self: '[Circular ~]' },
        }),
      );
    });

    it('handles Date objects as message parameters', () => {
      const date = new Date('2023-01-01T00:00:00.000Z');
      triggerConsole('info', 'Time:', date);

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.attributes?.['sentry.message.parameter.0']).toBe('2023-01-01T00:00:00.000Z');
    });

    it('preserves sentry.origin from object attributes when object is first arg', () => {
      triggerConsole('info', { 'sentry.origin': 'custom.origin', key: 'val' }, 'msg');

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('{"sentry.origin":"custom.origin","key":"val"} msg');
      expect(call.attributes?.['sentry.origin']).toBe('custom.origin');
    });

    it('captures empty message when called with no arguments', () => {
      triggerConsole('log');

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('');
    });

    it('forwards normalizeDepth and normalizeMaxBreadth to formatConsoleArgs', () => {
      triggerConsole('info', 'Hello', 'world');

      expect(formatConsoleArgs).toHaveBeenCalledWith(['Hello', 'world'], 3, 1000);
    });
  });
});
