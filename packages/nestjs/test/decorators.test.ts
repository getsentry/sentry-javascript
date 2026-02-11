import 'reflect-metadata';
import * as core from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SentryCron, SentryExceptionCaptured, SentryTraced } from '../src/decorators';
import * as helpers from '../src/helpers';

describe('SentryTraced decorator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a span with correct operation and name', async () => {
    const startSpanSpy = vi.spyOn(core, 'startSpan');

    const originalMethod = async (param1: string, param2: number): Promise<string> => {
      return `${param1}-${param2}`;
    };

    const descriptor: PropertyDescriptor = {
      value: originalMethod,
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = SentryTraced('test-operation')(
      {}, // target
      'testMethod',
      descriptor,
    );

    const decoratedMethod = decoratedDescriptor.value as typeof originalMethod;
    const result = await decoratedMethod('test', 123);

    expect(result).toBe('test-123');
    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        op: 'test-operation',
        name: 'testMethod',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nestjs.sentry_traced',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'test-operation',
        },
      },
      expect.any(Function),
    );
  });

  it('should use default operation name when not provided', async () => {
    const startSpanSpy = vi.spyOn(core, 'startSpan');

    const originalMethod = async (): Promise<string> => {
      return 'success';
    };

    const descriptor: PropertyDescriptor = {
      value: originalMethod,
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = SentryTraced()({}, 'testDefaultOp', descriptor);
    const decoratedMethod = decoratedDescriptor.value as typeof originalMethod;
    const result = await decoratedMethod();

    expect(result).toBe('success');
    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        op: 'function', // default value
        name: 'testDefaultOp',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nestjs.sentry_traced',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function',
        },
      },
      expect.any(Function),
    );
  });

  it('should work with synchronous methods', () => {
    const startSpanSpy = vi.spyOn(core, 'startSpan');

    const originalMethod = (value: number): number => {
      return value * 2;
    };

    const descriptor: PropertyDescriptor = {
      value: originalMethod,
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = SentryTraced('sync-operation')({}, 'syncMethod', descriptor);
    const decoratedMethod = decoratedDescriptor.value as typeof originalMethod;
    const result = decoratedMethod(5);

    expect(result).toBe(10);
    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        op: 'sync-operation',
        name: 'syncMethod',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nestjs.sentry_traced',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'sync-operation',
        },
      },
      expect.any(Function),
    );
  });

  it('should handle complex object parameters', () => {
    const startSpanSpy = vi.spyOn(core, 'startSpan');

    const originalMethod = (data: { id: number; items: string[] }): string[] => {
      return data.items.map(item => `${data.id}-${item}`);
    };

    const descriptor: PropertyDescriptor = {
      value: originalMethod,
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = SentryTraced('data-processing')({}, 'processData', descriptor);
    const decoratedMethod = decoratedDescriptor.value as typeof originalMethod;
    const complexData = { id: 123, items: ['a', 'b', 'c'] };
    const result = decoratedMethod(complexData);

    expect(result).toEqual(['123-a', '123-b', '123-c']);
    expect(startSpanSpy).toHaveBeenCalledTimes(1);
  });

  it('should preserve function metadata', () => {
    const getMetadataKeysSpy = vi.spyOn(Reflect, 'getMetadataKeys').mockReturnValue(['test-key']);
    const getMetadataSpy = vi.spyOn(Reflect, 'getMetadata').mockReturnValue('test-value');
    const defineMetadataSpy = vi.spyOn(Reflect, 'defineMetadata').mockImplementation(() => {});

    const originalMethod = () => 'result';
    const descriptor = {
      value: originalMethod,
      writable: true,
      configurable: true,
      enumerable: true,
    };

    const decoratedDescriptor = SentryTraced()({}, 'metadataMethod', descriptor);
    decoratedDescriptor.value();

    expect(getMetadataKeysSpy).toHaveBeenCalled();
    expect(getMetadataSpy).toHaveBeenCalled();
    expect(defineMetadataSpy).toHaveBeenCalled();

    getMetadataKeysSpy.mockRestore();
    getMetadataSpy.mockRestore();
    defineMetadataSpy.mockRestore();
  });
});

describe('SentryCron decorator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call withMonitor with correct parameters', async () => {
    const withMonitorSpy = vi.spyOn(core, 'withMonitor');

    const originalMethod = async (): Promise<string> => {
      return 'success';
    };

    const descriptor: PropertyDescriptor = {
      value: originalMethod,
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const monitorSlug = 'test-monitor';
    const monitorConfig: core.MonitorConfig = { schedule: { value: '10 * * * *', type: 'crontab' } };

    const decoratedDescriptor = SentryCron(monitorSlug, monitorConfig)(
      {}, // target
      'cronMethod',
      descriptor,
    );

    const decoratedMethod = decoratedDescriptor?.value as typeof originalMethod;
    const result = await decoratedMethod();

    expect(result).toBe('success');
    expect(withMonitorSpy).toHaveBeenCalledTimes(1);
    expect(withMonitorSpy).toHaveBeenCalledWith(monitorSlug, expect.any(Function), monitorConfig);
  });

  it('should work with optional monitor config', async () => {
    const withMonitorSpy = vi.spyOn(core, 'withMonitor');

    const originalMethod = async (): Promise<string> => {
      return 'success';
    };

    const descriptor: PropertyDescriptor = {
      value: originalMethod,
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const monitorSlug = 'test-monitor';

    const decoratedDescriptor = SentryCron(monitorSlug)(
      {}, // target
      'cronMethod',
      descriptor,
    );

    const decoratedMethod = decoratedDescriptor?.value as typeof originalMethod;
    const result = await decoratedMethod();

    expect(result).toBe('success');
    expect(withMonitorSpy).toHaveBeenCalledTimes(1);
    expect(withMonitorSpy).toHaveBeenCalledWith(monitorSlug, expect.any(Function), undefined);
  });

  it('should preserve function metadata', () => {
    const getMetadataKeysSpy = vi.spyOn(Reflect, 'getMetadataKeys').mockReturnValue(['cron-key']);
    const getMetadataSpy = vi.spyOn(Reflect, 'getMetadata').mockReturnValue('cron-value');
    const defineMetadataSpy = vi.spyOn(Reflect, 'defineMetadata').mockImplementation(() => {});

    const originalMethod = () => 'cron result';
    const descriptor = {
      value: originalMethod,
      writable: true,
      configurable: true,
      enumerable: true,
    };

    const decoratedDescriptor = SentryCron('monitor-slug')({}, 'cronMethod', descriptor);
    typeof decoratedDescriptor?.value === 'function' && decoratedDescriptor.value();

    expect(getMetadataKeysSpy).toHaveBeenCalled();
    expect(getMetadataSpy).toHaveBeenCalled();
    expect(defineMetadataSpy).toHaveBeenCalled();

    getMetadataKeysSpy.mockRestore();
    getMetadataSpy.mockRestore();
    defineMetadataSpy.mockRestore();
  });
});

describe('SentryExceptionCaptured decorator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should capture non-expected exceptions', () => {
    const captureExceptionSpy = vi.spyOn(core, 'captureException');
    const isExpectedErrorSpy = vi.spyOn(helpers, 'isExpectedError').mockReturnValue(false);

    const originalCatch = vi.fn().mockImplementation((exception, host) => {
      return { exception, host };
    });

    const descriptor: PropertyDescriptor = {
      value: originalCatch,
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = SentryExceptionCaptured()(
      {}, // target
      'catch',
      descriptor,
    );

    const decoratedMethod = decoratedDescriptor.value;
    const exception = new Error('Test exception');
    const host = { switchToHttp: () => ({}) };

    decoratedMethod(exception, host);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(exception, {
      mechanism: {
        handled: false,
        type: 'auto.function.nestjs.exception_captured',
      },
    });
    expect(originalCatch).toHaveBeenCalledWith(exception, host);

    isExpectedErrorSpy.mockRestore();
  });

  it('should not capture expected exceptions', () => {
    const captureExceptionSpy = vi.spyOn(core, 'captureException');
    const isExpectedErrorSpy = vi.spyOn(helpers, 'isExpectedError').mockReturnValue(true);

    const originalCatch = vi.fn().mockImplementation((exception, host) => {
      return { exception, host };
    });

    const descriptor: PropertyDescriptor = {
      value: originalCatch,
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = SentryExceptionCaptured()(
      {}, // target
      'catch',
      descriptor,
    );

    const decoratedMethod = decoratedDescriptor.value;
    const exception = new Error('Expected exception');
    const host = { switchToHttp: () => ({}) };

    decoratedMethod(exception, host);

    expect(captureExceptionSpy).not.toHaveBeenCalled();
    expect(originalCatch).toHaveBeenCalledWith(exception, host);

    isExpectedErrorSpy.mockRestore();
  });

  it('should preserve function metadata', () => {
    const getMetadataKeysSpy = vi.spyOn(Reflect, 'getMetadataKeys').mockReturnValue(['exception-key']);
    const getMetadataSpy = vi.spyOn(Reflect, 'getMetadata').mockReturnValue('exception-value');
    const defineMetadataSpy = vi.spyOn(Reflect, 'defineMetadata').mockImplementation(() => {});

    const originalMethod = () => ({ handled: true });
    const descriptor = {
      value: originalMethod,
      writable: true,
      configurable: true,
      enumerable: true,
    };

    const decoratedDescriptor = SentryExceptionCaptured()({}, 'catch', descriptor);
    vi.spyOn(helpers, 'isExpectedError').mockReturnValue(true);

    decoratedDescriptor.value(new Error(), {});

    expect(getMetadataKeysSpy).toHaveBeenCalled();
    expect(getMetadataSpy).toHaveBeenCalled();
    expect(defineMetadataSpy).toHaveBeenCalled();

    getMetadataKeysSpy.mockRestore();
    getMetadataSpy.mockRestore();
    defineMetadataSpy.mockRestore();
  });

  it('should handle additional arguments', () => {
    const captureExceptionSpy = vi.spyOn(core, 'captureException');
    vi.spyOn(helpers, 'isExpectedError').mockReturnValue(false);

    const originalCatch = vi.fn().mockImplementation((exception, host, arg1, arg2) => {
      return { exception, host, arg1, arg2 };
    });

    const descriptor: PropertyDescriptor = {
      value: originalCatch,
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = SentryExceptionCaptured()(
      {}, // target
      'catch',
      descriptor,
    );

    const decoratedMethod = decoratedDescriptor.value;
    const exception = new Error('Test exception');
    const host = { switchToHttp: () => ({}) };
    const arg1 = 'extra1';
    const arg2 = 'extra2';

    decoratedMethod(exception, host, arg1, arg2);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(originalCatch).toHaveBeenCalledWith(exception, host, arg1, arg2);
  });
});
