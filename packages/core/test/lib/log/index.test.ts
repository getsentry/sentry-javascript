import { describe, expect, it, vi } from 'vitest';
import {
  _INTERNAL_flushLogsBuffer,
  _INTERNAL_getLogBuffer,
  _INTERNAL_captureLog,
  logAttributeToSerializedLogAttribute,
} from '../../../src/logs';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';
import * as loggerModule from '../../../src/utils-hoist/logger';
import { Scope } from '../../../src';

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
});
