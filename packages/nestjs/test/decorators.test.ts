import 'reflect-metadata';
import { SetMetadata } from '@nestjs/common';
import { CODE_FUNCTION_NAME } from '@sentry/conventions/attributes';
import * as core from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
          [CODE_FUNCTION_NAME]: 'testMethod',
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
          [CODE_FUNCTION_NAME]: 'testDefaultOp',
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
          [CODE_FUNCTION_NAME]: 'syncMethod',
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

describe('SentryCron decorator with @Cron', () => {
  // Mirrors `@Cron()` of `@nestjs/schedule`, which stores its options under this metadata key.
  const Cron = (cronTime: unknown, options: Record<string, unknown> = {}): MethodDecorator =>
    SetMetadata('SCHEDULE_CRON_OPTIONS', { ...options, cronTime });

  // Mirrors the SDK's own `@Cron()` instrumentation, which swaps the method before nest stores the metadata.
  const WrappingCron =
    (cronTime: unknown): MethodDecorator =>
    (target, propertyKey, descriptor) => {
      const original = descriptor.value as unknown as (...args: unknown[]) => unknown;
      (descriptor as PropertyDescriptor).value = function (this: unknown, ...args: unknown[]) {
        return original.apply(this, args);
      };
      return Cron(cronTime)(target, propertyKey, descriptor);
    };

  // Applies decorators the way TypeScript does: listed top to bottom, applied bottom to top.
  function decorate(...decorators: MethodDecorator[]): { job: () => Promise<string> } {
    class Service {}
    let descriptor: PropertyDescriptor = {
      value: async () => 'done',
      writable: true,
      enumerable: false,
      configurable: true,
    };
    for (const decorator of [...decorators].reverse()) {
      descriptor = (decorator(Service.prototype, 'job', descriptor) as PropertyDescriptor | undefined) ?? descriptor;
    }
    Object.defineProperty(Service.prototype, 'job', descriptor);
    return new Service() as { job: () => Promise<string> };
  }

  beforeEach(() => {
    // `@Cron()` without a `timeZone` runs in the server's local time zone.
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'Asia/Tokyo',
    } as Intl.ResolvedDateTimeFormatOptions);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('derives the monitor config when @SentryCron is above @Cron', async () => {
    const withMonitorSpy = vi.spyOn(core, 'withMonitor');
    const service = decorate(SentryCron('my-job'), Cron('0 * * * *'));

    expect(await service.job()).toBe('done');
    expect(withMonitorSpy).toHaveBeenCalledWith('my-job', expect.any(Function), {
      schedule: { type: 'crontab', value: '0 * * * *' },
      timezone: 'Asia/Tokyo',
    });
  });

  it('derives the monitor config when @Cron is above @SentryCron', async () => {
    const withMonitorSpy = vi.spyOn(core, 'withMonitor');
    const service = decorate(Cron('0 * * * *'), SentryCron('my-job'));

    await service.job();
    expect(withMonitorSpy).toHaveBeenCalledWith('my-job', expect.any(Function), {
      schedule: { type: 'crontab', value: '0 * * * *' },
      timezone: 'Asia/Tokyo',
    });
  });

  it('derives the monitor config when @Cron replaces the method', async () => {
    const withMonitorSpy = vi.spyOn(core, 'withMonitor');
    const service = decorate(WrappingCron('0 * * * *'), SentryCron('my-job'));

    await service.job();
    expect(withMonitorSpy).toHaveBeenCalledWith('my-job', expect.any(Function), {
      schedule: { type: 'crontab', value: '0 * * * *' },
      timezone: 'Asia/Tokyo',
    });
  });

  it('drops a fixed seconds field and passes the time zone', async () => {
    const withMonitorSpy = vi.spyOn(core, 'withMonitor');
    const service = decorate(SentryCron('my-job'), Cron('0 30 9 * * 1-5', { timeZone: 'Europe/Vienna' }));

    await service.job();
    expect(withMonitorSpy).toHaveBeenCalledWith('my-job', expect.any(Function), {
      schedule: { type: 'crontab', value: '30 9 * * 1-5' },
      timezone: 'Europe/Vienna',
    });
  });

  it.each([
    ['a sub-minute schedule', Cron('*/5 * * * * *')],
    ['a one-off date', Cron(new Date())],
    ['an unknown preset', Cron('@reboot')],
    ['a utc offset', Cron('0 * * * *', { utcOffset: 120 })],
    ['a numeric month', Cron('0 9 1 5 *')],
    ['a day-of-month step with a day of week', Cron('0 9 */2 * MON')],
    ['a fixed-offset time zone', Cron('0 * * * *', { timeZone: 'UTC+3' })],
    ['an unknown time zone', Cron('0 * * * *', { timeZone: 'Mars/Olympus' })],
  ])('sends no monitor config for %s', async (_, cronDecorator) => {
    const withMonitorSpy = vi.spyOn(core, 'withMonitor');
    const service = decorate(SentryCron('my-job'), cronDecorator);

    await service.job();
    expect(withMonitorSpy).toHaveBeenCalledWith('my-job', expect.any(Function), undefined);
  });

  it.each([
    ['a month name', '0 9 1 MAY *'],
    ['both day fields', '0 9 1-7 * MON'],
  ])('sends a crontab with %s', async (_, crontab) => {
    const withMonitorSpy = vi.spyOn(core, 'withMonitor');
    const service = decorate(SentryCron('my-job'), Cron(crontab));

    await service.job();
    expect(withMonitorSpy).toHaveBeenCalledWith('my-job', expect.any(Function), {
      schedule: { type: 'crontab', value: crontab },
      timezone: 'Asia/Tokyo',
    });
  });

  it('sends no monitor config when the local time zone is unknown', async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'Etc/Unknown',
    } as Intl.ResolvedDateTimeFormatOptions);
    const withMonitorSpy = vi.spyOn(core, 'withMonitor');
    const service = decorate(SentryCron('my-job'), Cron('0 * * * *'));

    await service.job();
    expect(withMonitorSpy).toHaveBeenCalledWith('my-job', expect.any(Function), undefined);
  });

  it.each([
    ['@hourly', '@hourly'],
    ['@daily', '@daily'],
    ['@WEEKLY', '@weekly'],
    ['@monthly', '@monthly'],
    ['@yearly', '@yearly'],
    ['@annually', '@annually'],
    ['@midnight', '0 0 * * *'],
    ['@weekdays', '0 0 * * 1-5'],
  ])('sends the preset %s as %s', async (preset, value) => {
    const withMonitorSpy = vi.spyOn(core, 'withMonitor');
    const service = decorate(SentryCron('my-job'), Cron(preset));

    await service.job();
    expect(withMonitorSpy).toHaveBeenCalledWith('my-job', expect.any(Function), {
      schedule: { type: 'crontab', value },
      timezone: 'Asia/Tokyo',
    });
  });

  it('warns when monitor settings are passed but no schedule can be derived', async () => {
    const warnSpy = vi.spyOn(core.debug, 'warn').mockImplementation(() => undefined);
    const withMonitorSpy = vi.spyOn(core, 'withMonitor').mockImplementation((_, callback) => callback());
    const service = decorate(SentryCron('my-job', { checkinMargin: 2 }), Cron('*/5 * * * * *'));

    await service.job();
    await service.job();
    expect(withMonitorSpy).toHaveBeenCalledWith('my-job', expect.any(Function), undefined);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"my-job"'));
  });

  it('does not warn when no monitor settings are passed', async () => {
    const warnSpy = vi.spyOn(core.debug, 'warn').mockImplementation(() => undefined);
    vi.spyOn(core, 'withMonitor').mockImplementation((_, callback) => callback());
    const service = decorate(SentryCron('my-job'), Cron('*/5 * * * * *'));

    await service.job();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('sends no monitor config with fromCronDecorator: false', async () => {
    const warnSpy = vi.spyOn(core.debug, 'warn').mockImplementation(() => undefined);
    const withMonitorSpy = vi.spyOn(core, 'withMonitor');
    const service = decorate(SentryCron('my-job', { fromCronDecorator: false, checkinMargin: 2 }), Cron('0 * * * *'));

    await service.job();
    expect(withMonitorSpy).toHaveBeenCalledWith('my-job', expect.any(Function), undefined);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('fromCronDecorator is false'));
  });

  it('keeps the other monitor settings', async () => {
    const withMonitorSpy = vi.spyOn(core, 'withMonitor');
    const service = decorate(SentryCron('my-job', { checkinMargin: 2, maxRuntime: 10 }), Cron('0 * * * *'));

    await service.job();
    expect(withMonitorSpy).toHaveBeenCalledWith('my-job', expect.any(Function), {
      schedule: { type: 'crontab', value: '0 * * * *' },
      timezone: 'Asia/Tokyo',
      checkinMargin: 2,
      maxRuntime: 10,
    });
  });

  it('uses an explicit monitor config as is', async () => {
    const withMonitorSpy = vi.spyOn(core, 'withMonitor');
    const monitorConfig: core.MonitorConfig = { schedule: { type: 'interval', value: 1, unit: 'hour' } };
    const service = decorate(SentryCron('my-job', monitorConfig), Cron('0 * * * *'));

    await service.job();
    expect(withMonitorSpy).toHaveBeenCalledWith('my-job', expect.any(Function), monitorConfig);
  });

  it('does not accept a schedule or time zone together with fromCronDecorator', () => {
    // @ts-expect-error - `fromCronDecorator` only applies to settings without a schedule
    SentryCron('my-job', { schedule: { type: 'crontab', value: '0 * * * *' }, fromCronDecorator: false });
    // @ts-expect-error - the time zone comes from `@Cron()`
    SentryCron('my-job', { timezone: 'Europe/Vienna', checkinMargin: 2 });
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
