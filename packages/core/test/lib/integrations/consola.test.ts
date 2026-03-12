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
    describe('calling consola with object-only', () => {
      it('args=[object] with message key uses only message as log message and other keys as attributes', () => {
        sentryReporter.log({
          type: 'log',
          level: 2,
          tag: '',
          // Calling consola with a `message` key like below will format the log object like here in this test
          args: ['Calling: consola.log({ message: "", time: new Date(), userId: 123, smallObj: { word: "hi" } })'],
          time: '2026-02-24T10:24:04.477Z',
          userId: 123,
          smallObj: { word: 'hi' },
        });
        const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
        expect(call.message).toBe(
          'Calling: consola.log({ message: "", time: new Date(), userId: 123, smallObj: { word: "hi" } })',
        );
        expect(call.attributes).toMatchObject({
          time: '2026-02-24T10:24:04.477Z',
          userId: 123,
          smallObj: { word: 'hi' },
        });
      });

      it('args=[object] with no message key uses empty message and object as attributes', () => {
        sentryReporter.log({
          type: 'log',
          level: 2,
          tag: '',
          args: [
            {
              noMessage: 'Calling: consola.log({ noMessage: "", time: new Date() })',
              time: '2026-02-24T10:24:04.477Z',
            },
          ],
        });
        const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
        expect(call.message).toBe(
          '{"noMessage":"Calling: consola.log({ noMessage: \\"\\", time: new Date() })","time":"2026-02-24T10:24:04.477Z"}',
        );
        expect(call.attributes).toMatchObject({
          noMessage: 'Calling: consola.log({ noMessage: "", time: new Date() })',
          time: '2026-02-24T10:24:04.477Z',
        });
      });

      it('args=[object with message] keeps message in attributes only (e.g. .raw())', () => {
        sentryReporter.log({
          type: 'log',
          level: 2,
          tag: '',
          args: [
            {
              message: 'Calling: consola.raw({ message: "", userId: 123, smallObj: { word: "hi" } })',
              userId: 123,
              smallObj: { word: 'hi' },
            },
          ],
        });
        const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
        expect(call.message).toBe(
          '{"message":"Calling: consola.raw({ message: \\"\\", userId: 123, smallObj: { word: \\"hi\\" } })","userId":123,"smallObj":{"word":"hi"}}',
        );
        expect(call.attributes).toMatchObject({
          message: 'Calling: consola.raw({ message: "", userId: 123, smallObj: { word: "hi" } })',
          userId: 123,
          smallObj: { word: 'hi' },
        });
      });
    });

    it('should format message from args', () => {
      sentryReporter.log({
        type: 'info',
        args: ['Hello', 'world', 123, { key: 'value' }],
      });

      expect(formatConsoleArgs).toHaveBeenCalledWith(['Hello', 'world', 123, { key: 'value' }], 3, 1000);
      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'Hello world 123 {"key":"value"}',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'info',
          'sentry.message.parameter.0': 'world',
          'sentry.message.parameter.1': 123,
          'sentry.message.parameter.2': { key: 'value' },
          'sentry.message.template': 'Hello {} {} {}',
        },
      });
    });

    it('uses consolaMessage when result.message is empty (e.g. args is [])', () => {
      sentryReporter.log({
        type: 'info',
        message: 'From consola message key',
        args: [],
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('From consola message key');
    });

    it('uses formatConsoleArgs when result.message and consolaMessage are falsy but args is truthy', () => {
      sentryReporter.log({
        type: 'info',
        args: [],
      });

      expect(formatConsoleArgs).toHaveBeenCalledWith([], 3, 1000);
      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('');
    });

    it('overrides consola.tag or sentry.origin with object properties', () => {
      sentryReporter.log({
        type: 'info',
        message: 'Test',
        tag: 'api',
        args: [{ 'sentry.origin': 'object-args', 'consola.tag': 'object-args-tag' }, 'Test'],
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.attributes?.['sentry.origin']).toBe('object-args');
      expect(call.attributes?.['consola.tag']).toBe('object-args-tag');
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

    it('adds additional params in object-first mode', () => {
      sentryReporter.log({
        type: 'info',
        args: [
          {
            level1: { level2: { level3: { level4: 'deep' } } },
            simpleKey: 'simple value',
          },
          'Deep object',
          12345,
          { another: 'object', level1: { level2: { level3: { level4: 'deep' } } } },
        ],
      });

      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe(
        '{"level1":{"level2":{"level3":"[Object]"}},"simpleKey":"simple value"} Deep object 12345 {"another":"object","level1":{"level2":{"level3":"[Object]"}}}',
      );
      expect(call.attributes?.level1).toEqual({ level2: { level3: '[Object]' } });
      expect(call.attributes?.simpleKey).toBe('simple value');

      expect(call.attributes?.['sentry.message.template']).toBeUndefined();
      expect(call.attributes?.['sentry.message.parameter.0']).toBe(12345);
      expect(call.attributes?.['sentry.message.parameter.1']).toStrictEqual({
        another: 'object',
        level1: { level2: { level3: '[Object]' } },
      });
    });

    it('stores Date and Error in message params (fallback)', () => {
      const date = new Date('2023-01-01T00:00:00.000Z');
      sentryReporter.log({ type: 'info', args: ['Time:', date] });
      expect(vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0]!.attributes?.['sentry.message.parameter.0']).toBe(
        '2023-01-01T00:00:00.000Z',
      );

      vi.clearAllMocks();
      const err = new Error('Test error');
      sentryReporter.log({ type: 'error', args: ['Error occurred:', err] });
      const errCall = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(errCall.attributes?.['sentry.message.parameter.0']).toMatchObject({
        message: 'Test error',
        name: 'Error',
      });
    });

    it('handles console substitution patterns in first arg', () => {
      sentryReporter.log({ type: 'info', args: ['Value: %d, another: %s', 42, 'hello'] });
      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];

      // We don't substitute as it gets too complicated on the client-side: https://github.com/getsentry/sentry-javascript/pull/17703
      expect(call.message).toBe('Value: %d, another: %s 42 hello');
      expect(call.attributes?.['sentry.message.template']).toBeUndefined();
      expect(call.attributes?.['sentry.message.parameter.0']).toBeUndefined();
    });

    it.each([
      ['string', ['Normal log', { data: 1 }, 123], 'Normal log {} {}', undefined],
      ['array', [[1, 2, 3], 'Array data'], undefined, undefined],
      ['Error', [new Error('Test'), 'Error occurred'], undefined, 'error'],
    ] as const)('falls back to non-object extracting when first arg is %s', (_, args, template, level) => {
      vi.clearAllMocks();
      // @ts-expect-error Testing legacy fallback
      sentryReporter.log({ type: level ?? 'info', args });
      expect(formatConsoleArgs).toHaveBeenCalled();
      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      if (template !== undefined) expect(call.attributes?.['sentry.message.template']).toBe(template);
      if (template === 'Normal log {} {}') expect(call.attributes?.data).toBeUndefined();
      if (level) expect(call.level).toBe(level);
    });

    it('object-first: empty object as first arg', () => {
      sentryReporter.log({ type: 'info', args: [{}, 'Empty object log'] });
      const call = vi.mocked(_INTERNAL_captureLog).mock.calls[0]![0];
      expect(call.message).toBe('{} Empty object log');
      expect(call.attributes?.['sentry.origin']).toBe('auto.log.consola');
    });

    it('should handle args with unparseable objects', () => {
      const circular: any = {};
      circular.self = circular;

      sentryReporter.log({
        type: 'info',
        args: ['Message', circular],
      });

      expect(_INTERNAL_captureLog).toHaveBeenCalledWith({
        level: 'info',
        message: 'Message {"self":"[Circular ~]"}',
        attributes: {
          'sentry.origin': 'auto.log.consola',
          'consola.type': 'info',
          'sentry.message.template': 'Message {}',
          'sentry.message.parameter.0': { self: '[Circular ~]' },
        },
      });
    });

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

    it('Uses "message" key as fallback message, when no args are available', () => {
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
});
