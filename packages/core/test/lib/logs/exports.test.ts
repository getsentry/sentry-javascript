import { describe, expect, it, vi } from 'vitest';
import {
  _INTERNAL_flushLogsBuffer,
  _INTERNAL_getLogBuffer,
  _INTERNAL_captureLog,
  logAttributeToSerializedLogAttribute,
} from '../../../src/logs/exports';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';
import * as loggerModule from '../../../src/utils-hoist/logger';
import { Scope, fmt } from '../../../src';
import type { Log } from '../../../src/types-hoist/log';

const PUBLIC_DSN = 'https://username@domain/123';

describe('logAttributeToSerializedLogAttribute', () => {
  it('serializes number values', () => {
    const result = logAttributeToSerializedLogAttribute('count', 42);
    expect(result).toEqual({
      key: 'count',
      value: { doubleValue: 42 },
    });
  });

  it('serializes boolean values', () => {
    const result = logAttributeToSerializedLogAttribute('enabled', true);
    expect(result).toEqual({
      key: 'enabled',
      value: { boolValue: true },
    });
  });

  it('serializes string values', () => {
    const result = logAttributeToSerializedLogAttribute('username', 'john_doe');
    expect(result).toEqual({
      key: 'username',
      value: { stringValue: 'john_doe' },
    });
  });

  it('serializes object values as JSON strings', () => {
    const obj = { name: 'John', age: 30 };
    const result = logAttributeToSerializedLogAttribute('user', obj);
    expect(result).toEqual({
      key: 'user',
      value: { stringValue: JSON.stringify(obj) },
    });
  });

  it('serializes array values as JSON strings', () => {
    const array = [1, 2, 3, 'test'];
    const result = logAttributeToSerializedLogAttribute('items', array);
    expect(result).toEqual({
      key: 'items',
      value: { stringValue: JSON.stringify(array) },
    });
  });

  it('serializes undefined values as empty strings', () => {
    const result = logAttributeToSerializedLogAttribute('missing', undefined);
    expect(result).toEqual({
      key: 'missing',
      value: { stringValue: '' },
    });
  });

  it('serializes null values as JSON strings', () => {
    const result = logAttributeToSerializedLogAttribute('empty', null);
    expect(result).toEqual({
      key: 'empty',
      value: { stringValue: 'null' },
    });
  });
});

describe('_INTERNAL_captureLog', () => {
  it('captures and sends logs', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, _experiments: { enableLogs: true } });
    const client = new TestClient(options);

    _INTERNAL_captureLog({ level: 'info', message: 'test log message' }, client, undefined);
    expect(_INTERNAL_getLogBuffer(client)).toHaveLength(1);
    expect(_INTERNAL_getLogBuffer(client)?.[0]).toEqual(
      expect.objectContaining({
        severityText: 'info',
        body: {
          stringValue: 'test log message',
        },
        timeUnixNano: expect.any(String),
      }),
    );
  });

  it('does not capture logs when enableLogs experiment is not enabled', () => {
    const logWarnSpy = vi.spyOn(loggerModule.logger, 'warn').mockImplementation(() => undefined);
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
    const client = new TestClient(options);

    _INTERNAL_captureLog({ level: 'info', message: 'test log message' }, client, undefined);

    expect(logWarnSpy).toHaveBeenCalledWith('logging option not enabled, log will not be captured.');
    expect(_INTERNAL_getLogBuffer(client)).toBeUndefined();

    logWarnSpy.mockRestore();
  });

  it('includes trace context when available', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, _experiments: { enableLogs: true } });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setPropagationContext({
      traceId: '3d9355f71e9c444b81161599adac6e29',
      sampleRand: 1,
    });

    _INTERNAL_captureLog({ level: 'error', message: 'test log with trace' }, client, scope);

    expect(_INTERNAL_getLogBuffer(client)?.[0]).toEqual(
      expect.objectContaining({
        traceId: '3d9355f71e9c444b81161599adac6e29',
        severityNumber: 17, // error level maps to 17
      }),
    );
  });

  it('includes release and environment in log attributes when available', () => {
    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      _experiments: { enableLogs: true },
      release: '1.0.0',
      environment: 'test',
    });
    const client = new TestClient(options);

    _INTERNAL_captureLog({ level: 'info', message: 'test log with metadata' }, client, undefined);

    const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
    expect(logAttributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'release', value: { stringValue: '1.0.0' } }),
        expect.objectContaining({ key: 'environment', value: { stringValue: 'test' } }),
      ]),
    );
  });

  it('includes custom attributes in log', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, _experiments: { enableLogs: true } });
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
    expect(logAttributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'userId', value: { stringValue: '123' } }),
        expect.objectContaining({ key: 'component', value: { stringValue: 'auth' } }),
      ]),
    );
  });

  it('flushes logs buffer when it reaches max size', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, _experiments: { enableLogs: true } });
    const client = new TestClient(options);

    // Fill the buffer to max size (100 is the MAX_LOG_BUFFER_SIZE constant in client.ts)
    for (let i = 0; i < 100; i++) {
      _INTERNAL_captureLog({ level: 'info', message: `log message ${i}` }, client, undefined);
    }

    expect(_INTERNAL_getLogBuffer(client)).toHaveLength(100);

    // Add one more to trigger flush
    _INTERNAL_captureLog({ level: 'info', message: 'trigger flush' }, client, undefined);

    expect(_INTERNAL_getLogBuffer(client)).toEqual([]);
  });

  it('does not flush logs buffer when it is empty', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, _experiments: { enableLogs: true } });
    const client = new TestClient(options);
    const mockSendEnvelope = vi.spyOn(client as any, 'sendEnvelope').mockImplementation(() => {});
    _INTERNAL_flushLogsBuffer(client);
    expect(mockSendEnvelope).not.toHaveBeenCalled();
  });

  it('handles parameterized strings correctly', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, _experiments: { enableLogs: true } });
    const client = new TestClient(options);

    const parameterizedMessage = fmt`Hello ${'John'}, welcome to ${'Sentry'}`;

    _INTERNAL_captureLog({ level: 'info', message: parameterizedMessage }, client, undefined);

    const logAttributes = _INTERNAL_getLogBuffer(client)?.[0]?.attributes;
    expect(logAttributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'sentry.message.template',
          value: { stringValue: 'Hello %s, welcome to %s' },
        }),
        expect.objectContaining({
          key: 'sentry.message.param.0',
          value: { stringValue: 'John' },
        }),
        expect.objectContaining({
          key: 'sentry.message.param.1',
          value: { stringValue: 'Sentry' },
        }),
      ]),
    );
  });

  it('processes logs through beforeSendLog when provided', () => {
    const beforeSendLog = vi.fn().mockImplementation(log => ({
      ...log,
      message: `Modified: ${log.message}`,
      attributes: { ...log.attributes, processed: true },
    }));

    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      _experiments: { enableLogs: true, beforeSendLog },
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
        body: {
          stringValue: 'Modified: original message',
        },
        attributes: expect.arrayContaining([
          expect.objectContaining({ key: 'processed', value: { boolValue: true } }),
          expect.objectContaining({ key: 'original', value: { boolValue: true } }),
        ]),
      }),
    );
  });

  it('drops logs when beforeSendLog returns null', () => {
    const beforeSendLog = vi.fn().mockReturnValue(null);
    const recordDroppedEventSpy = vi.spyOn(TestClient.prototype, 'recordDroppedEvent');
    const loggerWarnSpy = vi.spyOn(loggerModule.logger, 'warn').mockImplementation(() => undefined);

    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      _experiments: { enableLogs: true, beforeSendLog },
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
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, _experiments: { enableLogs: true } });
    const client = new TestClient(options);

    const log: Log = {
      level: 'info',
      message: 'test message',
    };

    _INTERNAL_captureLog(log, client, undefined);

    expect(beforeCaptureLogSpy).toHaveBeenCalledWith('beforeCaptureLog', log);
    expect(beforeCaptureLogSpy).toHaveBeenCalledWith('afterCaptureLog', log);
    beforeCaptureLogSpy.mockRestore();
  });
});
