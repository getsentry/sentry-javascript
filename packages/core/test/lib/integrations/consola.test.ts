import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient, getCurrentScope } from '../../../src/currentScopes';
import { createConsolaReporter } from '../../../src/integrations/consola';
import { _INTERNAL_captureLog } from '../../../src/logs/internal';
import { formatConsoleArgs } from '../../../src/logs/utils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

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

  it('creates a reporter with a log function', () => {
    const reporter = createConsolaReporter();
    expect(reporter).toEqual({ log: expect.any(Function) });
  });

  /**
   * Real-world Consola reporter payload shapes.
   * LogObj structures match what Consola passes to reporters (consola merges
   * consola.log({ message, ...rest }) into args: [message] + rest on logObj;
   * consola.log.raw() and multi-arg calls pass raw args).
   */
  describe('real-world consola payloads', () => {
    it('consola-merged: args=[message] with extra keys on logObj', () => {
      sentryReporter.log({
        type: 'log',
        level: 2,
        args: ['obj-message'],
        userId: 123,
        action: 'login',
        time: '2026-02-24T10:24:04.477Z',
        smallObj: { word: 'hi' },
        tag: '',
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('obj-message');
      expect(call.attributes).toMatchObject({
        'consola.userId': 123,
        'consola.action': 'login',
        'consola.time': '2026-02-24T10:24:04.477Z',
        'consola.smallObj': { word: 'hi' },
      });
      expect(call.attributes?.['sentry.message.parameter.0']).toBeUndefined();
    });

    it('direct reporter.log({ type, message, userId, sessionId }) captures custom keys with consola. prefix', () => {
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
        'consola.userId': 123,
        'consola.sessionId': 'abc-123',
      });
    });

    it('object-first: args=[object] with no message key', () => {
      sentryReporter.log({
        type: 'log',
        level: 2,
        args: [
          {
            noMessage: 'obj-no-message',
            userId: 123,
            action: 'login',
            time: '2026-02-24T10:24:04.477Z',
            smallObj: { word: 'hi' },
          },
        ],
        tag: '',
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('');
      expect(call.attributes).toMatchObject({
        noMessage: 'obj-no-message',
        userId: 123,
        action: 'login',
        smallObj: { word: 'hi' },
      });
    });

    it('object-first: args=[object with message] (e.g. .raw())', () => {
      sentryReporter.log({
        type: 'log',
        level: 2,
        args: [
          {
            message: 'raw-obj-message',
            userId: 123,
            action: 'login',
            smallObj: { word: 'hi' },
          },
        ],
        tag: '',
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('');
      expect(call.attributes).toMatchObject({
        message: 'raw-obj-message',
        userId: 123,
        action: 'login',
        smallObj: { word: 'hi' },
      });
    });

    it('object-first: args=[object, string message] uses second arg as message', () => {
      sentryReporter.log({
        type: 'log',
        level: 2,
        args: [
          { message: 'obj-message', userId: 123, action: 'login', smallObj: { word: 'hi' } },
          'additional message  obj-message',
        ],
        tag: '',
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('additional message  obj-message');
      expect(call.attributes).toMatchObject({
        message: 'obj-message',
        userId: 123,
        action: 'login',
        smallObj: { word: 'hi' },
      });
      expect(call.attributes?.['sentry.message.parameter.0']).toBeUndefined();
    });

    it('object-first: args=[object, message, ...params] adds params as attributes', () => {
      sentryReporter.log({
        type: 'log',
        level: 2,
        args: [{ message: 'a-message' }, 'additional message  a-message', 1234, 'additional-arg'],
        tag: '',
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('additional message  a-message');
      expect(call.attributes?.message).toBe('a-message');
      expect(call.attributes?.['sentry.message.parameter.0']).toBe(1234);
      expect(call.attributes?.['sentry.message.parameter.1']).toBe('additional-arg');
    });

    it('fallback: args=[string only] no extra keys', () => {
      sentryReporter.log({ type: 'log', args: ['hello'] });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('hello');
      expect(call.attributes?.['sentry.message.template']).toBeUndefined();
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
      sentryReporter.log({ type, message: `${type} message` });
      expect(_INTERNAL_captureLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: expectedLevel,
          message: `${type} message`,
          attributes: expect.objectContaining({ 'consola.type': type }),
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
      sentryReporter.log({ type, message: `Test ${type}` });
      expect(_INTERNAL_captureLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: expectedLevel,
          attributes: expect.objectContaining({ 'consola.type': type }),
        }),
      );
    });

    it('uses level number when type is missing', () => {
      sentryReporter.log({ level: 0, message: 'Fatal message' });
      expect(_INTERNAL_captureLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'fatal',
          message: 'Fatal message',
          attributes: expect.objectContaining({ 'consola.level': 0 }),
        }),
      );
    });
  });

  describe('level filtering', () => {
    it('captures only specified levels', () => {
      const reporter = createConsolaReporter({ levels: ['error', 'warn'] });
      reporter.log({ type: 'error', message: 'e' });
      reporter.log({ type: 'warn', message: 'w' });
      reporter.log({ type: 'info', message: 'i' });
      expect(_INTERNAL_captureLog).toHaveBeenCalledTimes(2);
    });

    it('captures all default levels when none specified', () => {
      ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].forEach(type => {
        sentryReporter.log({ type, message: `${type}` });
      });
      expect(_INTERNAL_captureLog).toHaveBeenCalledTimes(6);
    });
  });

  describe('message and args handling', () => {
    it('formats message from args when message not provided (template + params)', () => {
      sentryReporter.log({
        type: 'info',
        args: ['Hello', 'world', 123, { key: 'value' }],
      });

      expect(formatConsoleArgs).toHaveBeenCalledWith(['Hello', 'world', 123, { key: 'value' }], 3, 1000);
      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.level).toBe('info');
      expect(call.message).toContain('Hello');
      expect(call.attributes?.['sentry.message.template']).toBe('Hello {} {} {}');
      expect(call.attributes?.['sentry.message.parameter.0']).toBe('world');
      expect(call.attributes?.['sentry.message.parameter.1']).toBe(123);
      expect(call.attributes?.['sentry.message.parameter.2']).toEqual({ key: 'value' });
    });

    it('handles circular references in args', () => {
      const circular: any = {};
      circular.self = circular;
      sentryReporter.log({ type: 'info', args: ['Message', circular] });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.attributes?.['sentry.message.template']).toBe('Message {}');
      expect(call.attributes?.['sentry.message.parameter.0']).toEqual({ self: '[Circular ~]' });
    });

    it('extracts multiple objects: first as attributes, second as param (object-first)', () => {
      sentryReporter.log({
        type: 'info',
        message: 'User action',
        args: [{ userId: 123 }, { sessionId: 'abc-123' }],
      });

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

    it('does not override consola.tag or sentry.origin with object properties', () => {
      sentryReporter.log({
        type: 'info',
        message: 'Test',
        tag: 'api',
        args: [{ 'sentry.origin': 'no', 'consola.tag': 'no' }, 'Test'],
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.attributes?.['sentry.origin']).toBe('auto.log.consola');
      expect(call.attributes?.['consola.tag']).toBe('api');
    });

    it('respects normalizeDepth in fallback mode', () => {
      sentryReporter.log({
        type: 'info',
        args: [
          'Deep',
          {
            level1: { level2: { level3: { level4: 'deep' } } },
            simpleKey: 'simple value',
          },
        ],
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.attributes?.['sentry.message.parameter.0']).toEqual({
        level1: { level2: { level3: '[Object]' } },
        simpleKey: 'simple value',
      });
    });

    it('respects normalizeDepth in object-first mode', () => {
      sentryReporter.log({
        type: 'info',
        args: [
          {
            level1: { level2: { level3: { level4: 'deep' } } },
            simpleKey: 'simple value',
          },
          'Deep object',
        ],
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('Deep object');
      expect(call.attributes?.level1).toEqual({ level2: { level3: '[Object]' } });
      expect(call.attributes?.simpleKey).toBe('simple value');
    });

    it('stores Date and Error in message params (fallback)', () => {
      const date = new Date('2023-01-01T00:00:00.000Z');
      const err = new Error('Test error');
      sentryReporter.log({ type: 'info', args: ['Time:', date] });
      expect(vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0]!.attributes?.['sentry.message.parameter.0']).toBe(
        '2023-01-01T00:00:00.000Z',
      );

      vi.clearAllMocks();
      sentryReporter.log({ type: 'error', args: ['Error occurred:', err] });
      const errCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(errCall.attributes?.['sentry.message.parameter.0']).toMatchObject({
        message: 'Test error',
        name: 'Error',
      });
    });

    it('falls back to legacy when first arg is string', () => {
      sentryReporter.log({ type: 'info', args: ['Legacy log', { data: 1 }, 123] });
      expect(formatConsoleArgs).toHaveBeenCalledWith(['Legacy log', { data: 1 }, 123], 3, 1000);
      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.attributes?.['sentry.message.template']).toBe('Legacy log {} {}');
      expect(call.attributes?.data).toBeUndefined();
    });

    it('falls back to legacy when first arg is array', () => {
      sentryReporter.log({ type: 'info', args: [[1, 2, 3], 'Array data'] });
      expect(formatConsoleArgs).toHaveBeenCalled();
      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.attributes?.['sentry.message.template']).toBeUndefined();
    });

    it('falls back to legacy when first arg is Error', () => {
      sentryReporter.log({ type: 'error', args: [new Error('Test'), 'Error occurred'] });
      expect(formatConsoleArgs).toHaveBeenCalled();
      expect(vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0].level).toBe('error');
    });

    it('object-first: empty object as first arg', () => {
      sentryReporter.log({ type: 'info', args: [{}, 'Empty object log'] });
      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('Empty object log');
      expect(call.attributes?.['sentry.origin']).toBe('auto.log.consola');
    });

    it('object-first: non-string second arg yields empty message', () => {
      sentryReporter.log({ type: 'info', args: [{ userId: 999 }, 123, 'other'] });
      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('');
      expect(call.attributes?.userId).toBe(999);
      expect(call.attributes?.['sentry.message.parameter.0']).toBe(123);
      expect(call.attributes?.['sentry.message.parameter.1']).toBe('other');
    });

    it('only extracts attributes from plain objects (not Error)', () => {
      sentryReporter.log({
        type: 'info',
        args: ['Mixed:', { userId: 123, name: 'test' }, new Error('test')],
      });
      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.attributes?.['sentry.message.parameter.0']).toEqual({ userId: 123, name: 'test' });
      expect(call.attributes?.['sentry.message.parameter.1']).toMatchObject({ message: 'test', name: 'Error' });
      expect(call.attributes?.userId).toBeUndefined();
    });
  });

  describe('custom extractAttributes', () => {
    it('uses custom extraction when provided', () => {
      const reporter = createConsolaReporter({
        extractAttributes: args =>
          args[0] === 'CUSTOM'
            ? { attributes: { customExtraction: true }, message: 'Custom message', remainingArgs: [] }
            : null,
      });
      reporter.log({ type: 'info', args: ['CUSTOM', 'ignored'] });

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

    it('falls back to default when custom returns null', () => {
      const reporter = createConsolaReporter({ extractAttributes: () => null });
      reporter.log({ type: 'info', args: [{ userId: 123 }, 'Fallback to default'] });

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'Fallback to default',
        attributes: expect.objectContaining({ userId: 123 }),
      });
    });

    it('custom can return only attributes or only message', () => {
      const attrOnly = createConsolaReporter({
        extractAttributes: args => ({ attributes: { custom: args[0] } }),
      });
      attrOnly.log({ type: 'info', args: ['test-value'] });
      expect(vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0].attributes?.custom).toBe('test-value');
      expect(vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0].message).toBe('');

      vi.clearAllMocks();
      const msgOnly = createConsolaReporter({
        extractAttributes: args => ({ message: `Formatted: ${args[0]}` }),
      });
      msgOnly.log({ type: 'info', args: ['test'] });
      expect(vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0].message).toBe('Formatted: test');
    });

    it('custom remainingArgs=[] omits params', () => {
      const reporter = createConsolaReporter({
        extractAttributes: args => ({
          attributes: { allConsumed: true },
          message: String(args[0]),
          remainingArgs: [],
        }),
      });
      reporter.log({ type: 'info', args: ['value', 'extra'] });
      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('value');
      expect(call.attributes?.allConsumed).toBe(true);
      expect(call.attributes?.['sentry.message.parameter.0']).toBeUndefined();
    });

    it('uses consolaMessage when custom does not provide message', () => {
      const reporter = createConsolaReporter({
        extractAttributes: () => ({ attributes: { custom: true } }),
      });
      reporter.log({ type: 'info', message: 'From consola', args: ['ignored'] });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('From consola');
      expect(call.attributes?.custom).toBe(true);
    });

    it('handles custom extraction with circular refs in remainingArgs', () => {
      const circular: any = { self: null };
      circular.self = circular;
      const reporter = createConsolaReporter({
        extractAttributes: () => ({ message: 'Test', remainingArgs: [circular] }),
      });
      reporter.log({ type: 'info', args: ['value'] });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.attributes?.['sentry.message.parameter.0']).toEqual({ self: '[Circular ~]' });
    });
  });
});
