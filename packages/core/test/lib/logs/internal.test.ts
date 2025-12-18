import { describe, expect, it, vi } from 'vitest';
import { fmt, Scope } from '../../../src';
import { _INTERNAL_captureLog, _INTERNAL_flushLogsBuffer, _INTERNAL_getLogBuffer } from '../../../src/logs/internal';
import type { Log } from '../../../src/types-hoist/log';
import * as loggerModule from '../../../src/utils/debug-logger';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const PUBLIC_DSN = 'https://username@domain/123';

describe('_INTERNAL_captureLog', () => {
  it('captures and sends logs', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    _INTERNAL_captureLog({ level: 'info', message: 'test log message' }, scope);
    expect(_INTERNAL_getLogBuffer(client)).toHaveLength(1);
    expect(_INTERNAL_getLogBuffer(client)?.[0]).toEqual(
      expect.objectContaining({
        level: 'info',
        body: 'test log message',
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
        severity_number: 9,
        attributes: {},
      }),
    );
  });

  it('does not capture logs when enableLogs is not enabled', () => {
    const logWarnSpy = vi.spyOn(loggerModule.debug, 'warn').mockImplementation(() => undefined);
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    _INTERNAL_captureLog({ level: 'info', message: 'test log message' }, scope);

    expect(logWarnSpy).toHaveBeenCalledWith('logging option not enabled, log will not be captured.');
    expect(_INTERNAL_getLogBuffer(client)).toBeUndefined();

    logWarnSpy.mockRestore();
  });

  it('includes trace context when available', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);
    scope.setPropagationContext({
      traceId: '3d9355f71e9c444b81161599adac6e29',
      sampleRand: 1,
    });

    _INTERNAL_captureLog({ level: 'error', message: 'test log with trace' }, scope);

    expect(_INTERNAL_getLogBuffer(client)?.[0]).toEqual(
      expect.objectContaining({
        trace_id: '3d9355f71e9c444b81161599adac6e29',
        severity_number: 17, // error level maps to 17
      }),
    );
  });

  it('includes release and environment in log attributes when available', () => {
    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      enableLogs: true,
      release: '1.0.0',
      environment: 'test',
    });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    _INTERNAL_captureLog({ level: 'info', message: 'test log with metadata' }, scope);

    const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
    expect(logAttributes).toEqual({
      'sentry.release': {
        value: '1.0.0',
        type: 'string',
      },
      'sentry.environment': {
        value: 'test',
        type: 'string',
      },
    });
  });

  it('includes SDK metadata in log attributes when available', () => {
    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      enableLogs: true,
    });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);
    // Mock getSdkMetadata to return SDK info
    vi.spyOn(client, 'getSdkMetadata').mockReturnValue({
      sdk: {
        name: 'sentry.javascript.node',
        version: '7.0.0',
      },
    });

    _INTERNAL_captureLog({ level: 'info', message: 'test log with SDK metadata' }, scope);

    const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
    expect(logAttributes).toEqual({
      'sentry.sdk.name': {
        value: 'sentry.javascript.node',
        type: 'string',
      },
      'sentry.sdk.version': {
        value: '7.0.0',
        type: 'string',
      },
    });
  });

  it('does not include SDK metadata in log attributes when not available', () => {
    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      enableLogs: true,
    });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);
    // Mock getSdkMetadata to return no SDK info
    vi.spyOn(client, 'getSdkMetadata').mockReturnValue({});

    _INTERNAL_captureLog({ level: 'info', message: 'test log without SDK metadata' }, scope);

    const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
    expect(logAttributes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'sentry.sdk.name' }),
        expect.objectContaining({ key: 'sentry.sdk.version' }),
      ]),
    );
  });

  describe('attributes', () => {
    it('includes custom attributes in log', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      _INTERNAL_captureLog(
        {
          level: 'info',
          message: 'test log with custom attributes',
          attributes: { userId: '123', component: 'auth' },
        },
        scope,
      );

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        userId: {
          value: '123',
          type: 'string',
        },
        component: {
          value: 'auth',
          type: 'string',
        },
      });
    });

    it('applies scope attributes attributes to log', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      scope.setAttribute('scope_1', 'attribute_value');
      scope.setAttribute('scope_2', { value: 38, unit: 'gigabyte' });
      scope.setAttributes({
        scope_3: true,
        // these are invalid since for now we don't support arrays
        scope_4: [1, 2, 3],
        scope_5: { value: [true, false, true], unit: 'second' },
      });

      _INTERNAL_captureLog(
        {
          level: 'info',
          message: 'test log with custom attributes',
          attributes: { userId: '123', component: 'auth' },
        },
        scope,
      );

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;

      expect(logAttributes).toStrictEqual({
        userId: {
          value: '123',
          type: 'string',
        },
        component: {
          value: 'auth',
          type: 'string',
        },
        scope_1: {
          type: 'string',
          value: 'attribute_value',
        },
        scope_2: {
          type: 'integer',
          unit: 'gigabyte',
          value: 38,
        },
        scope_3: {
          type: 'boolean',
          value: true,
        },
      });
    });
  });

  it('flushes logs buffer when it reaches max size', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    // Fill the buffer to max size (100 is the MAX_LOG_BUFFER_SIZE constant in client.ts)
    for (let i = 0; i < 100; i++) {
      _INTERNAL_captureLog({ level: 'info', message: `log message ${i}` }, scope);
    }

    expect(_INTERNAL_getLogBuffer(client)).toHaveLength(100);

    // Add one more to trigger flush
    _INTERNAL_captureLog({ level: 'info', message: 'trigger flush' }, scope);

    // After flushing the 100 logs, the new log starts a fresh buffer with 1 item
    const buffer = _INTERNAL_getLogBuffer(client);
    expect(buffer).toHaveLength(1);
    expect(buffer?.[0]?.body).toBe('trigger flush');
  });

  it('does not flush logs buffer when it is empty', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
    const client = new TestClient(options);

    const mockSendEnvelope = vi.spyOn(client as any, 'sendEnvelope').mockImplementation(() => {});
    _INTERNAL_flushLogsBuffer(client);
    expect(mockSendEnvelope).not.toHaveBeenCalled();
  });

  it('handles parameterized strings correctly', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    const parameterizedMessage = fmt`Hello ${'John'}, welcome to ${'Sentry'}`;

    _INTERNAL_captureLog({ level: 'info', message: parameterizedMessage }, scope);

    const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
    expect(logAttributes).toEqual({
      'sentry.message.template': {
        value: 'Hello %s, welcome to %s',
        type: 'string',
      },
      'sentry.message.parameter.0': {
        value: 'John',
        type: 'string',
      },
      'sentry.message.parameter.1': {
        value: 'Sentry',
        type: 'string',
      },
    });
  });

  it('does not set the template attribute if there are no parameters', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    _INTERNAL_captureLog({ level: 'debug', message: fmt`User logged in` }, scope);

    const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
    expect(logAttributes).toEqual({});
  });

  it('processes logs through beforeSendLog when provided', () => {
    const beforeSendLog = vi.fn().mockImplementation(log => ({
      ...log,
      message: `Modified: ${log.message}`,
      attributes: { ...log.attributes, processed: true },
    }));

    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      enableLogs: true,
      beforeSendLog,
    });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    scope.setAttribute('scope_1', 'attribute_value');
    scope.setAttribute('scope_2', { value: 38, unit: 'gigabytes' });

    _INTERNAL_captureLog(
      {
        level: 'info',
        message: 'original message',
        attributes: { original: true },
      },
      scope,
    );

    expect(beforeSendLog).toHaveBeenCalledWith({
      level: 'info',
      message: 'original message',
      attributes: {
        original: true,
        // scope attributes are not included in beforeSendLog - they're only added during serialization
      },
    });

    const logBuffer = _INTERNAL_getLogBuffer(client);
    expect(logBuffer).toBeDefined();
    expect(logBuffer?.[0]).toEqual(
      expect.objectContaining({
        body: 'Modified: original message',
        attributes: {
          processed: {
            value: true,
            type: 'boolean',
          },
          original: {
            value: true,
            type: 'boolean',
          },
          // during serialization, they're converted to the typed attribute format
          scope_1: {
            value: 'attribute_value',
            type: 'string',
          },
          scope_2: {
            value: 38,
            unit: 'gigabytes',
            type: 'integer',
          },
        },
      }),
    );
  });

  it('drops logs when beforeSendLog returns null', () => {
    const beforeSendLog = vi.fn().mockReturnValue(null);
    const recordDroppedEventSpy = vi.spyOn(TestClient.prototype, 'recordDroppedEvent');
    const loggerWarnSpy = vi.spyOn(loggerModule.debug, 'warn').mockImplementation(() => undefined);

    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      enableLogs: true,
      beforeSendLog,
    });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    _INTERNAL_captureLog(
      {
        level: 'info',
        message: 'test message',
      },
      scope,
    );

    expect(beforeSendLog).toHaveBeenCalled();
    expect(recordDroppedEventSpy).toHaveBeenCalledWith('before_send', 'log_item', 1);
    expect(loggerWarnSpy).toHaveBeenCalledWith('beforeSendLog returned null, log will not be captured.');
    expect(_INTERNAL_getLogBuffer(client)).toBeUndefined();

    recordDroppedEventSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it('emits beforeCaptureLog and afterCaptureLog events', () => {
    const beforeCaptureLogSpy = vi.spyOn(TestClient.prototype, 'emit');
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    const log: Log = {
      level: 'info',
      message: 'test message',
      attributes: {},
    };

    _INTERNAL_captureLog(log, scope);

    expect(beforeCaptureLogSpy).toHaveBeenCalledWith('beforeCaptureLog', log);
    expect(beforeCaptureLogSpy).toHaveBeenCalledWith('afterCaptureLog', log);
    beforeCaptureLogSpy.mockRestore();
  });

  describe('replay integration with onlyIfSampled', () => {
    it('includes replay ID for sampled sessions', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with sampled session
      const mockReplayIntegration = {
        getReplayId: vi.fn((onlyIfSampled?: boolean) => {
          // Simulate behavior: return ID for sampled sessions
          return onlyIfSampled ? 'sampled-replay-id' : 'any-replay-id';
        }),
        getRecordingMode: vi.fn(() => 'session'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureLog({ level: 'info', message: 'test log with sampled replay' }, scope);

      // Verify getReplayId was called with onlyIfSampled=true
      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        'sentry.replay_id': {
          value: 'sampled-replay-id',
          type: 'string',
        },
      });
    });

    it('excludes replay ID for unsampled sessions when onlyIfSampled=true', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with unsampled session
      const mockReplayIntegration = {
        getReplayId: vi.fn((onlyIfSampled?: boolean) => {
          // Simulate behavior: return undefined for unsampled when onlyIfSampled=true
          return onlyIfSampled ? undefined : 'unsampled-replay-id';
        }),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureLog({ level: 'info', message: 'test log with unsampled replay' }, scope);

      // Verify getReplayId was called with onlyIfSampled=true
      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      // Should not include sentry.replay_id attribute
      expect(logAttributes).toEqual({});
    });

    it('includes replay ID for buffer mode sessions', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with buffer mode session
      const mockReplayIntegration = {
        getReplayId: vi.fn((_onlyIfSampled?: boolean) => {
          // Buffer mode should still return ID even with onlyIfSampled=true
          return 'buffer-replay-id';
        }),
        getRecordingMode: vi.fn(() => 'buffer'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureLog({ level: 'info', message: 'test log with buffer replay' }, scope);

      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        'sentry.replay_id': {
          value: 'buffer-replay-id',
          type: 'string',
        },
        'sentry._internal.replay_is_buffering': {
          value: true,
          type: 'boolean',
        },
      });
    });

    it('handles missing replay integration gracefully', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock no replay integration found
      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(undefined);

      _INTERNAL_captureLog({ level: 'info', message: 'test log without replay' }, scope);

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      // Should not include sentry.replay_id attribute
      expect(logAttributes).toEqual({});
    });

    it('combines replay ID with other log attributes', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
        release: '1.0.0',
        environment: 'test',
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration
      const mockReplayIntegration = {
        getReplayId: vi.fn(() => 'test-replay-id'),
        getRecordingMode: vi.fn(() => 'session'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureLog(
        {
          level: 'info',
          message: 'test log with replay and other attributes',
          attributes: { component: 'auth', action: 'login' },
        },
        scope,
      );

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        component: {
          value: 'auth',
          type: 'string',
        },
        action: {
          value: 'login',
          type: 'string',
        },
        'sentry.release': {
          value: '1.0.0',
          type: 'string',
        },
        'sentry.environment': {
          value: 'test',
          type: 'string',
        },
        'sentry.replay_id': {
          value: 'test-replay-id',
          type: 'string',
        },
      });
    });

    it('does not set replay ID attribute when getReplayId returns null or undefined', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      const testCases = [null, undefined];

      testCases.forEach(returnValue => {
        // Clear buffer for each test
        _INTERNAL_getLogBuffer(client)?.splice(0);

        const mockReplayIntegration = {
          getReplayId: vi.fn(() => returnValue),
        };

        vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

        _INTERNAL_captureLog({ level: 'info', message: `test log with replay returning ${returnValue}` }, scope);

        const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
        expect(logAttributes).toEqual({});
        expect(logAttributes).not.toHaveProperty('sentry.replay_id');
      });
    });

    it('sets replay_is_buffering attribute when replay is in buffer mode', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with buffer mode
      const mockReplayIntegration = {
        getReplayId: vi.fn(() => 'buffer-replay-id'),
        getRecordingMode: vi.fn(() => 'buffer'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureLog({ level: 'info', message: 'test log with buffered replay' }, scope);

      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);
      expect(mockReplayIntegration.getRecordingMode).toHaveBeenCalled();

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        'sentry.replay_id': {
          value: 'buffer-replay-id',
          type: 'string',
        },
        'sentry._internal.replay_is_buffering': {
          value: true,
          type: 'boolean',
        },
      });
    });

    it('does not set replay_is_buffering attribute when replay is in session mode', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with session mode
      const mockReplayIntegration = {
        getReplayId: vi.fn(() => 'session-replay-id'),
        getRecordingMode: vi.fn(() => 'session'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureLog({ level: 'info', message: 'test log with session replay' }, scope);

      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);
      expect(mockReplayIntegration.getRecordingMode).toHaveBeenCalled();

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        'sentry.replay_id': {
          value: 'session-replay-id',
          type: 'string',
        },
      });
      expect(logAttributes).not.toHaveProperty('sentry._internal.replay_is_buffering');
    });

    it('does not set replay_is_buffering attribute when replay is undefined mode', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with undefined mode (replay stopped/disabled)
      const mockReplayIntegration = {
        getReplayId: vi.fn(() => 'stopped-replay-id'),
        getRecordingMode: vi.fn(() => undefined),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureLog({ level: 'info', message: 'test log with stopped replay' }, scope);

      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);
      expect(mockReplayIntegration.getRecordingMode).toHaveBeenCalled();

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        'sentry.replay_id': {
          value: 'stopped-replay-id',
          type: 'string',
        },
      });
      expect(logAttributes).not.toHaveProperty('sentry._internal.replay_is_buffering');
    });

    it('does not set replay_is_buffering attribute when no replay ID is available', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration that returns no replay ID but has buffer mode
      const mockReplayIntegration = {
        getReplayId: vi.fn(() => undefined),
        getRecordingMode: vi.fn(() => 'buffer'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureLog({ level: 'info', message: 'test log with buffer mode but no replay ID' }, scope);

      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);
      // getRecordingMode should not be called if there's no replay ID
      expect(mockReplayIntegration.getRecordingMode).not.toHaveBeenCalled();

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({});
      expect(logAttributes).not.toHaveProperty('sentry.replay_id');
      expect(logAttributes).not.toHaveProperty('sentry.internal.replay_is_buffering');
    });

    it('does not set replay_is_buffering attribute when replay integration is missing', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock no replay integration found
      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(undefined);

      _INTERNAL_captureLog({ level: 'info', message: 'test log without replay integration' }, scope);

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({});
      expect(logAttributes).not.toHaveProperty('sentry.replay_id');
      expect(logAttributes).not.toHaveProperty('sentry._internal.replay_is_buffering');
    });

    it('combines replay_is_buffering with other replay attributes', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
        release: '1.0.0',
        environment: 'test',
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with buffer mode
      const mockReplayIntegration = {
        getReplayId: vi.fn(() => 'buffer-replay-id'),
        getRecordingMode: vi.fn(() => 'buffer'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureLog(
        {
          level: 'info',
          message: 'test log with buffer replay and other attributes',
          attributes: { component: 'auth', action: 'login' },
        },
        scope,
      );

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        component: {
          value: 'auth',
          type: 'string',
        },
        action: {
          value: 'login',
          type: 'string',
        },
        'sentry.release': {
          value: '1.0.0',
          type: 'string',
        },
        'sentry.environment': {
          value: 'test',
          type: 'string',
        },
        'sentry.replay_id': {
          value: 'buffer-replay-id',
          type: 'string',
        },
        'sentry._internal.replay_is_buffering': {
          value: true,
          type: 'boolean',
        },
      });
    });
  });

  describe('user functionality', () => {
    it('includes user data in log attributes', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        id: '123',
        email: 'user@example.com',
        username: 'testuser',
      });

      _INTERNAL_captureLog({ level: 'info', message: 'test log with user' }, scope);

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        'user.id': {
          value: '123',
          type: 'string',
        },
        'user.email': {
          value: 'user@example.com',
          type: 'string',
        },
        'user.name': {
          value: 'testuser',
          type: 'string',
        },
      });
    });

    it('includes partial user data when only some fields are available', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
        sendDefaultPii: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        id: '123',
        // email and username are missing
      });

      _INTERNAL_captureLog({ level: 'info', message: 'test log with partial user' }, scope);

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        'user.id': {
          value: '123',
          type: 'string',
        },
      });
    });

    it('includes user email and username without id', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
        sendDefaultPii: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        email: 'user@example.com',
        username: 'testuser',
        // id is missing
      });

      _INTERNAL_captureLog({ level: 'info', message: 'test log with email and username' }, scope);

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        'user.email': {
          value: 'user@example.com',
          type: 'string',
        },
        'user.name': {
          value: 'testuser',
          type: 'string',
        },
      });
    });

    it('does not include user data when user object is empty', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
        sendDefaultPii: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({});

      _INTERNAL_captureLog({ level: 'info', message: 'test log with empty user' }, scope);

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({});
    });

    it('combines user data with other log attributes', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
        sendDefaultPii: true,
        release: '1.0.0',
        environment: 'test',
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        id: '123',
        email: 'user@example.com',
      });

      _INTERNAL_captureLog(
        {
          level: 'info',
          message: 'test log with user and other attributes',
          attributes: { component: 'auth', action: 'login' },
        },
        scope,
      );

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        component: {
          value: 'auth',
          type: 'string',
        },
        action: {
          value: 'login',
          type: 'string',
        },
        'user.id': {
          value: '123',
          type: 'string',
        },
        'user.email': {
          value: 'user@example.com',
          type: 'string',
        },
        'sentry.release': {
          value: '1.0.0',
          type: 'string',
        },
        'sentry.environment': {
          value: 'test',
          type: 'string',
        },
      });
    });

    it('handles user data with non-string values', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
        sendDefaultPii: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        id: 123, // number instead of string
        email: 'user@example.com',
        username: undefined, // undefined value
      });

      _INTERNAL_captureLog({ level: 'info', message: 'test log with non-string user values' }, scope);

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        'user.id': {
          value: 123,
          type: 'integer',
        },
        'user.email': {
          value: 'user@example.com',
          type: 'string',
        },
      });
    });

    it('preserves existing user attributes in log and does not override them', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
        sendDefaultPii: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        id: '123',
        email: 'user@example.com',
      });

      _INTERNAL_captureLog(
        {
          level: 'info',
          message: 'test log with existing user attributes',
          attributes: {
            'user.id': 'existing-id', // This should NOT be overridden by scope user
            'user.custom': 'custom-value', // This should be preserved
          },
        },
        scope,
      );

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        'user.custom': {
          value: 'custom-value',
          type: 'string',
        },
        'user.id': {
          value: 'existing-id', // Existing value is preserved
          type: 'string',
        },
        'user.email': {
          value: 'user@example.com', // Only added because user.email wasn't already present
          type: 'string',
        },
      });
    });

    it('only adds scope user data for attributes that do not already exist', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
        sendDefaultPii: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        id: 'scope-id',
        email: 'scope@example.com',
        username: 'scope-user',
      });

      _INTERNAL_captureLog(
        {
          level: 'info',
          message: 'test log with partial existing user attributes',
          attributes: {
            'user.email': 'existing@example.com', // This should be preserved
            'other.attr': 'value',
          },
        },
        scope,
      );

      const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
      expect(logAttributes).toEqual({
        'other.attr': {
          value: 'value',
          type: 'string',
        },
        'user.email': {
          value: 'existing@example.com', // Existing email is preserved
          type: 'string',
        },
        'user.id': {
          value: 'scope-id', // Added from scope because not present
          type: 'string',
        },
        'user.name': {
          value: 'scope-user', // Added from scope because not present
          type: 'string',
        },
      });
    });
  });

  it('overrides user-provided system attributes with SDK values', () => {
    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      enableLogs: true,
      release: 'sdk-release-1.0.0',
      environment: 'sdk-environment',
    });
    const client = new TestClient(options);
    // Mock getSdkMetadata to return SDK info
    vi.spyOn(client, 'getSdkMetadata').mockReturnValue({
      sdk: {
        name: 'sentry.javascript.node',
        version: '7.0.0',
      },
    });

    const scope = new Scope();
    scope.setClient(client);

    _INTERNAL_captureLog(
      {
        level: 'info',
        message: 'test log with user-provided system attributes',
        attributes: {
          'sentry.release': 'user-release-2.0.0',
          'sentry.environment': 'user-environment',
          'sentry.sdk.name': 'user-sdk-name',
          'sentry.sdk.version': 'user-sdk-version',
          'user.custom': 'preserved-value',
        },
      },
      scope,
    );

    const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
    expect(logAttributes).toEqual({
      'user.custom': {
        value: 'preserved-value',
        type: 'string',
      },
      'sentry.release': {
        value: 'sdk-release-1.0.0',
        type: 'string',
      },
      'sentry.environment': {
        value: 'sdk-environment',
        type: 'string',
      },
      'sentry.sdk.name': {
        value: 'sentry.javascript.node',
        type: 'string',
      },
      'sentry.sdk.version': {
        value: '7.0.0',
        type: 'string',
      },
    });
  });
});
