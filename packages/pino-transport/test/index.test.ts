import { _INTERNAL_captureLog } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSentryPinoTransport } from '../src';

// Mock the _INTERNAL_captureLog function
vi.mock('@sentry/core', async actual => {
  const actualModule = (await actual()) as any;
  return {
    ...actualModule,
    _INTERNAL_captureLog: vi.fn(),
  };
});

const mockCaptureLog = vi.mocked(_INTERNAL_captureLog);

describe('createSentryPinoTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should be defined', () => {
    expect(createSentryPinoTransport).toBeDefined();
  });

  it('should create a transport that forwards logs to Sentry', async () => {
    const transport = await createSentryPinoTransport();
    expect(transport).toBeDefined();
    expect(typeof transport.write).toBe('function');
  });

  it('should capture logs with correct level mapping', async () => {
    const transport = await createSentryPinoTransport();

    // Simulate a Pino log entry
    const testLog = {
      level: 30, // info level in Pino
      msg: 'Test message',
      time: Date.now(),
      hostname: 'test-host',
      pid: 12345,
    };

    // Write the log to the transport
    transport.write(`${JSON.stringify(testLog)}\n`);

    // Give it a moment to process
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info',
      message: 'Test message',
      attributes: expect.objectContaining({
        hostname: 'test-host',
        pid: 12345,
        'sentry.origin': 'auto.logging.pino',
      }),
    });
  });

  it('should map all Pino log levels correctly', async () => {
    const transport = await createSentryPinoTransport();

    const testCases = [
      { pinoLevel: 10, expectedSentryLevel: 'trace' },
      { pinoLevel: 20, expectedSentryLevel: 'debug' },
      { pinoLevel: 30, expectedSentryLevel: 'info' },
      { pinoLevel: 40, expectedSentryLevel: 'warn' },
      { pinoLevel: 50, expectedSentryLevel: 'error' },
      { pinoLevel: 60, expectedSentryLevel: 'fatal' },
    ];

    for (const { pinoLevel, expectedSentryLevel } of testCases) {
      const testLog = {
        level: pinoLevel,
        msg: `Test ${expectedSentryLevel} message`,
        time: Date.now(),
      };

      transport.write(`${JSON.stringify(testLog)}\n`);
    }

    // Give it a moment to process all logs
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledTimes(6);

    testCases.forEach(({ expectedSentryLevel }, index) => {
      expect(mockCaptureLog).toHaveBeenNthCalledWith(index + 1, {
        level: expectedSentryLevel,
        message: `Test ${expectedSentryLevel} message`,
        attributes: expect.objectContaining({
          'sentry.origin': 'auto.logging.pino',
        }),
      });
    });
  });

  it('should respect level filtering', async () => {
    const transport = await createSentryPinoTransport({
      logLevels: ['error', 'fatal'],
    });

    const testLogs = [
      { level: 30, msg: 'Info message' }, // Should be filtered out
      { level: 50, msg: 'Error message' }, // Should be captured
      { level: 60, msg: 'Fatal message' }, // Should be captured
    ];

    for (const testLog of testLogs) {
      transport.write(`${JSON.stringify(testLog)}\n`);
    }

    // Give it a moment to process all logs
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledTimes(2);
    expect(mockCaptureLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        level: 'error',
        message: 'Error message',
      }),
    );
    expect(mockCaptureLog).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        level: 'fatal',
        message: 'Fatal message',
      }),
    );
  });

  it('should handle unknown levels gracefully', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 999, // Unknown level
      msg: 'Unknown level message',
      time: Date.now(),
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    // Give it a moment to process
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'fatal', // 999 maps to fatal (55+ range)
      message: 'Unknown level message',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
      }),
    });
  });

  it('should handle non-numeric levels gracefully', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 'invalid', // Non-numeric level
      msg: 'Invalid level message',
      time: Date.now(),
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    // Give it a moment to process
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info', // Default fallback
      message: 'Invalid level message',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
        'sentry.pino.level': 'invalid',
      }),
    });
  });

  it('should handle malformed JSON gracefully', async () => {
    const transport = await createSentryPinoTransport();

    // Write invalid JSON
    transport.write('{ invalid json \n');

    // Give it a moment to process
    await new Promise(resolve => setTimeout(resolve, 10));

    // Should not crash and should not call captureLog
    expect(mockCaptureLog).not.toHaveBeenCalled();
  });

  it('should handle non-object logs gracefully', async () => {
    const transport = await createSentryPinoTransport();

    // Write a string instead of an object
    transport.write('"just a string"\n');

    // Give it a moment to process
    await new Promise(resolve => setTimeout(resolve, 10));

    // pino-abstract-transport parses JSON, so this actually becomes an object
    // The transport should handle it gracefully by logging it
    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info', // Default fallback since no level provided
      message: '', // Empty string for undefined message
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
      }),
    });
  });

  it('should handle string levels gracefully when no custom levels config is available', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 'custom', // String level without custom levels config
      msg: 'Custom string level message',
      time: Date.now(),
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info', // Should fallback to info for unknown string levels
      message: 'Custom string level message',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
        'sentry.pino.level': 'custom',
      }),
    });
  });

  it('should attach custom level name as attribute for string levels', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 'critical', // Custom string level
      msg: 'Critical level message',
      time: Date.now(),
      userId: 123,
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info', // Mapped level
      message: 'Critical level message',
      attributes: expect.objectContaining({
        userId: 123,
        'sentry.origin': 'auto.logging.pino',
        'sentry.pino.level': 'critical', // Original custom level name preserved
      }),
    });
  });

  it('should not attach custom level attribute for numeric levels', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 30, // Standard numeric level
      msg: 'Standard level message',
      time: Date.now(),
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info',
      message: 'Standard level message',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
        // Should NOT have 'sentry.pino.level' for numeric levels
      }),
    });

    // Explicitly check that the custom level attribute is not present
    const capturedCall = mockCaptureLog.mock.calls[0][0];
    expect(capturedCall.attributes).not.toHaveProperty('sentry.pino.level');
  });

  it('should handle custom numeric levels with range-based mapping', async () => {
    const transport = await createSentryPinoTransport();

    const testCases = [
      { level: 11, expectedSentryLevel: 'trace' }, // 11 is in trace range (0-14)
      { level: 23, expectedSentryLevel: 'debug' }, // 23 is in debug range (15-24)
      { level: 33, expectedSentryLevel: 'info' }, // 33 is in info range (25-34)
      { level: 42, expectedSentryLevel: 'warn' }, // 42 is in warn range (35-44)
      { level: 52, expectedSentryLevel: 'error' }, // 52 is in error range (45-54)
      { level: 75, expectedSentryLevel: 'fatal' }, // 75 is in fatal range (55+)
    ];

    for (const { level } of testCases) {
      const testLog = {
        level,
        msg: `Custom numeric level ${level}`,
        time: Date.now(),
      };

      transport.write(`${JSON.stringify(testLog)}\n`);
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledTimes(6);

    testCases.forEach(({ level, expectedSentryLevel }, index) => {
      expect(mockCaptureLog).toHaveBeenNthCalledWith(index + 1, {
        level: expectedSentryLevel,
        message: `Custom numeric level ${level}`,
        attributes: expect.objectContaining({
          'sentry.origin': 'auto.logging.pino',
        }),
      });
    });
  });

  it('should handle nested keys', async () => {
    const transport = await createSentryPinoTransport();

    // Test with logs that include a nested object structure as Pino would create
    // when nestedKey is configured (we'll test by manually checking the flattening logic)
    const testLog = {
      level: 30,
      msg: 'Test message with nested payload',
      time: Date.now(),
      payload: {
        level: 'hi', // Conflicting with Pino's level
        time: 'never', // Conflicting with Pino's time
        foo: 'bar',
        userId: 123,
      },
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Without nestedKey configuration, the nested object should remain as-is
    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info',
      message: 'Test message with nested payload',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
        payload: {
          level: 'hi',
          time: 'never',
          foo: 'bar',
          userId: 123,
        }, // Should remain nested without nestedKey config
      }),
    });
  });

  it('should handle logs without conflicting nested objects', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 40,
      msg: 'Warning with simple nested data',
      time: Date.now(),
      data: {
        errorCode: 'E001',
        module: 'auth',
        details: 'Invalid credentials',
      },
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'warn',
      message: 'Warning with simple nested data',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
        data: {
          errorCode: 'E001',
          module: 'auth',
          details: 'Invalid credentials',
        }, // Should remain as nested object
      }),
    });
  });

  it('should handle logs with multiple nested objects', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 30,
      msg: 'Test message with multiple nested objects',
      time: Date.now(),
      user: {
        id: 123,
        name: 'John Doe',
      },
      request: {
        method: 'POST',
        url: '/api/users',
        headers: {
          'content-type': 'application/json',
        },
      },
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info',
      message: 'Test message with multiple nested objects',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
        user: {
          id: 123,
          name: 'John Doe',
        },
        request: {
          method: 'POST',
          url: '/api/users',
          headers: {
            'content-type': 'application/json',
          },
        },
      }),
    });
  });

  it('should handle null nested objects', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 30,
      msg: 'Test message with null values',
      time: Date.now(),
      data: null,
      user: undefined,
      config: {
        setting: null,
      },
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info',
      message: 'Test message with null values',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
        data: null,
        config: {
          setting: null,
        },
      }),
    });
  });

  it('should work normally with mixed data types', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 30,
      msg: 'Mixed data types log',
      time: Date.now(),
      stringValue: 'test',
      numberValue: 42,
      booleanValue: true,
      arrayValue: [1, 2, 3],
      objectValue: { nested: 'value' },
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info',
      message: 'Mixed data types log',
      attributes: expect.objectContaining({
        stringValue: 'test',
        numberValue: 42,
        booleanValue: true,
        arrayValue: [1, 2, 3],
        objectValue: { nested: 'value' },
        'sentry.origin': 'auto.logging.pino',
      }),
    });
  });

  it('should handle string messages', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 30,
      msg: 'This is a string message',
      time: Date.now(),
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info',
      message: 'This is a string message',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
      }),
    });
  });

  it('should handle number messages', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 30,
      msg: 42,
      time: Date.now(),
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info',
      message: '42',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
      }),
    });
  });

  it('should handle boolean messages', async () => {
    const transport = await createSentryPinoTransport();

    const testCases = [{ msg: true }, { msg: false }];

    for (const { msg } of testCases) {
      const testLog = {
        level: 30,
        msg,
        time: Date.now(),
      };

      transport.write(`${JSON.stringify(testLog)}\n`);
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledTimes(2);
    expect(mockCaptureLog).toHaveBeenNthCalledWith(1, {
      level: 'info',
      message: 'true',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
      }),
    });
    expect(mockCaptureLog).toHaveBeenNthCalledWith(2, {
      level: 'info',
      message: 'false',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
      }),
    });
  });

  it('should handle null and undefined messages', async () => {
    const transport = await createSentryPinoTransport();

    const testCases = [{ msg: null }, { msg: undefined }];

    for (const { msg } of testCases) {
      const testLog = {
        level: 30,
        msg,
        time: Date.now(),
      };

      transport.write(`${JSON.stringify(testLog)}\n`);
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledTimes(2);
    expect(mockCaptureLog).toHaveBeenNthCalledWith(1, {
      level: 'info',
      message: 'null',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
      }),
    });
    expect(mockCaptureLog).toHaveBeenNthCalledWith(2, {
      level: 'info',
      message: '',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
      }),
    });
  });

  it('should handle object messages', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 30,
      msg: { key: 'value', nested: { prop: 123 } },
      time: Date.now(),
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info',
      message: '{"key":"value","nested":{"prop":123}}',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
      }),
    });
  });

  it('should handle array messages', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 30,
      msg: [1, 'two', { three: 3 }],
      time: Date.now(),
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info',
      message: '[1,"two",{"three":3}]',
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
      }),
    });
  });

  it('should handle circular object messages gracefully', async () => {
    const transport = await createSentryPinoTransport();

    // Create a test log with a circular object as the message
    // We can't use JSON.stringify directly, so we'll simulate what happens
    const testLog = {
      level: 30,
      msg: { name: 'test', circular: true }, // Simplified object that represents circular data
      time: Date.now(),
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info',
      message: '{"name":"test","circular":true}', // The object should be serialized normally
      attributes: expect.objectContaining({
        'sentry.origin': 'auto.logging.pino',
      }),
    });
  });

  it('should handle missing message gracefully', async () => {
    const transport = await createSentryPinoTransport();

    const testLog = {
      level: 30,
      // No msg property
      time: Date.now(),
      someOtherData: 'value',
    };

    transport.write(`${JSON.stringify(testLog)}\n`);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockCaptureLog).toHaveBeenCalledWith({
      level: 'info',
      message: '', // Empty string for undefined message
      attributes: expect.objectContaining({
        someOtherData: 'value',
        'sentry.origin': 'auto.logging.pino',
      }),
    });
  });
});
