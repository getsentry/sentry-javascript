import { describe, expect, it, vi } from 'vitest';
import { fmt, Scope } from '../../../src';
import {
  _INTERNAL_captureLog,
  _INTERNAL_flushLogsBuffer,
  _INTERNAL_getLogBuffer,
  logAttributeToSerializedLogAttribute,
} from '../../../src/logs/exports';
import type { Log } from '../../../src/types-hoist/log';
import * as loggerModule from '../../../src/utils/debug-logger';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const PUBLIC_DSN = 'https://username@domain/123';

describe('logAttributeToSerializedLogAttribute', () => {
  it('serializes integer values', () => {
    const result = logAttributeToSerializedLogAttribute(42);
    expect(result).toEqual({
      value: 42,
      type: 'integer',
    });
  });

  it('serializes double values', () => {
    const result = logAttributeToSerializedLogAttribute(42.34);
    expect(result).toEqual({
      value: 42.34,
      type: 'double',
    });
  });

  it('serializes boolean values', () => {
    const result = logAttributeToSerializedLogAttribute(true);
    expect(result).toEqual({
      value: true,
      type: 'boolean',
    });
  });

  it('serializes string values', () => {
    const result = logAttributeToSerializedLogAttribute('username');
    expect(result).toEqual({
      value: 'username',
      type: 'string',
    });
  });

  it('serializes object values as JSON strings', () => {
    const obj = { name: 'John', age: 30 };
    const result = logAttributeToSerializedLogAttribute(obj);
    expect(result).toEqual({
      value: JSON.stringify(obj),
      type: 'string',
    });
  });

  it('serializes array values as JSON strings', () => {
    const array = [1, 2, 3, 'test'];
    const result = logAttributeToSerializedLogAttribute(array);
    expect(result).toEqual({
      value: JSON.stringify(array),
      type: 'string',
    });
  });

  it('serializes undefined values as empty strings', () => {
    const result = logAttributeToSerializedLogAttribute(undefined);
    expect(result).toEqual({
      value: '',
      type: 'string',
    });
  });

  it('serializes null values as JSON strings', () => {
    const result = logAttributeToSerializedLogAttribute(null);
    expect(result).toEqual({
      value: 'null',
      type: 'string',
    });
  });
});

describe('_INTERNAL_captureLog', () => {
  it('captures and sends logs', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
    const client = new TestClient(options);

    _INTERNAL_captureLog({ level: 'info', message: 'test log message' }, client, undefined);
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

    _INTERNAL_captureLog({ level: 'info', message: 'test log message' }, client, undefined);

    expect(logWarnSpy).toHaveBeenCalledWith('logging option not enabled, log will not be captured.');
    expect(_INTERNAL_getLogBuffer(client)).toBeUndefined();

    logWarnSpy.mockRestore();
  });

  it('includes trace context when available', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setPropagationContext({
      traceId: '3d9355f71e9c444b81161599adac6e29',
      sampleRand: 1,
    });

    _INTERNAL_captureLog({ level: 'error', message: 'test log with trace' }, client, scope);

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

    _INTERNAL_captureLog({ level: 'info', message: 'test log with metadata' }, client, undefined);

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
    // Mock getSdkMetadata to return SDK info
    vi.spyOn(client, 'getSdkMetadata').mockReturnValue({
      sdk: {
        name: 'sentry.javascript.node',
        version: '7.0.0',
      },
    });

    _INTERNAL_captureLog({ level: 'info', message: 'test log with SDK metadata' }, client, undefined);

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
    // Mock getSdkMetadata to return no SDK info
    vi.spyOn(client, 'getSdkMetadata').mockReturnValue({});

    _INTERNAL_captureLog({ level: 'info', message: 'test log without SDK metadata' }, client, undefined);

    const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
    expect(logAttributes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'sentry.sdk.name' }),
        expect.objectContaining({ key: 'sentry.sdk.version' }),
      ]),
    );
  });

  it('includes custom attributes in log', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
    const client = new TestClient(options);

    _INTERNAL_captureLog(
      {
        level: 'info',
        message: 'test log with custom attributes',
        attributes: { userId: '123', component: 'auth' },
      },
      client,
      undefined,
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

  it('flushes logs buffer when it reaches max size', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableLogs: true });
    const client = new TestClient(options);

    // Fill the buffer to max size (100 is the MAX_LOG_BUFFER_SIZE constant in client.ts)
    for (let i = 0; i < 100; i++) {
      _INTERNAL_captureLog({ level: 'info', message: `log message ${i}` }, client, undefined);
    }

    expect(_INTERNAL_getLogBuffer(client)).toHaveLength(100);

    // Add one more to trigger flush
    _INTERNAL_captureLog({ level: 'info', message: 'trigger flush' }, client, undefined);

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

    const parameterizedMessage = fmt`Hello ${'John'}, welcome to ${'Sentry'}`;

    _INTERNAL_captureLog({ level: 'info', message: parameterizedMessage }, client, undefined);

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

    _INTERNAL_captureLog(
      {
        level: 'info',
        message: 'original message',
        attributes: { original: true },
      },
      client,
      undefined,
    );

    expect(beforeSendLog).toHaveBeenCalledWith({
      level: 'info',
      message: 'original message',
      attributes: { original: true },
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

    _INTERNAL_captureLog(
      {
        level: 'info',
        message: 'test message',
      },
      client,
      undefined,
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

    const log: Log = {
      level: 'info',
      message: 'test message',
      attributes: {},
    };

    _INTERNAL_captureLog(log, client, undefined);

    expect(beforeCaptureLogSpy).toHaveBeenCalledWith('beforeCaptureLog', log);
    expect(beforeCaptureLogSpy).toHaveBeenCalledWith('afterCaptureLog', log);
    beforeCaptureLogSpy.mockRestore();
  });

  describe('user functionality', () => {
    it('includes user data in log attributes', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        enableLogs: true,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setUser({
        id: '123',
        email: 'user@example.com',
        username: 'testuser',
      });

      _INTERNAL_captureLog({ level: 'info', message: 'test log with user' }, client, scope);

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
      scope.setUser({
        id: '123',
        // email and username are missing
      });

      _INTERNAL_captureLog({ level: 'info', message: 'test log with partial user' }, client, scope);

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
      scope.setUser({
        email: 'user@example.com',
        username: 'testuser',
        // id is missing
      });

      _INTERNAL_captureLog({ level: 'info', message: 'test log with email and username' }, client, scope);

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
      scope.setUser({});

      _INTERNAL_captureLog({ level: 'info', message: 'test log with empty user' }, client, scope);

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
        client,
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
      scope.setUser({
        id: 123, // number instead of string
        email: 'user@example.com',
        username: undefined, // undefined value
      });

      _INTERNAL_captureLog({ level: 'info', message: 'test log with non-string user values' }, client, scope);

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
        client,
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
        client,
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
      client,
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
