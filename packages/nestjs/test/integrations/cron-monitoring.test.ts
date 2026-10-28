import 'reflect-metadata';
import { tracingChannel } from 'node:diagnostics_channel';
import * as SentryCore from '@sentry/core';
import { Client, createTransport, initAndBind, resolvedSyncPromise } from '@sentry/core';
import { nestjsChannels as CHANNELS } from '@sentry/server-utils/orchestrion/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SentryCron } from '../../src/decorators';
import type { NestCronMonitoringOptions } from '../../src/integrations/cron-monitoring';
import { setCronMonitoringOptions } from '../../src/integrations/cron-monitoring';
import { subscribeToNestChannels } from '../../src/integrations/orchestrion-subscriber';

type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

class TestClient extends Client<any> {
  public eventFromException(): PromiseLike<any> {
    return resolvedSyncPromise({});
  }

  public eventFromMessage(): PromiseLike<any> {
    return resolvedSyncPromise({});
  }
}

let captureCheckIn: ReturnType<typeof vi.fn<(checkIn: SentryCore.CheckIn, config?: unknown) => string>>;

function initClient(options: NestCronMonitoringOptions): void {
  //@ts-expect-error - just a mock for the test
  initAndBind(TestClient, {
    dsn: 'https://username@domain/123',
    integrations: [],
    stackParser: () => [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, () => resolvedSyncPromise({})),
  });
  const client = SentryCore.getClient() as Client & { captureCheckIn?: unknown };
  captureCheckIn = vi.fn((_checkIn: SentryCore.CheckIn, _config?: unknown) => 'check-in-id');
  client.captureCheckIn = captureCheckIn;
  setCronMonitoringOptions(client, options);
}

// Drives the `@Cron()` factory channel and returns the decorator `@Cron()` would apply.
function cron(cronTime: unknown, options?: Record<string, unknown>): MethodDecorator {
  const data: { arguments: unknown[]; result?: unknown } = { arguments: [cronTime, options] };
  tracingChannel<{ arguments: unknown[]; result?: unknown }>(CHANNELS.NESTJS_SCHEDULE_CRON).traceSync(
    () => (_target: unknown, _key: unknown, descriptor: PropertyDescriptor) => {
      Reflect.defineMetadata('SCHEDULE_CRON_OPTIONS', { ...options, cronTime }, descriptor.value);
      return descriptor;
    },
    data,
  );
  return data.result as MethodDecorator;
}

// A decorator that replaces the method and copies its metadata, as Nest needs to still schedule it.
const wrapMethod: MethodDecorator = (_target, _key, descriptor: PropertyDescriptor) => {
  const original = descriptor.value as AnyFn;
  descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
    return original.apply(this, args);
  };
  for (const key of Reflect.getMetadataKeys(original)) {
    Reflect.defineMetadata(key, Reflect.getMetadata(key, original), descriptor.value);
  }
};

function decorate(className: string, decorators: MethodDecorator[]): AnyFn {
  const target = Object.create({ constructor: { name: className } }) as object;
  const descriptor: PropertyDescriptor = { value: function run(): void {}, configurable: true };
  for (const decorator of [...decorators].reverse()) {
    decorator(target, 'run', descriptor);
  }
  return descriptor.value as AnyFn;
}

// Drives the channel for the function `@nestjs/schedule` passes to `CronJob` as `onTick`, and returns it.
function cronJobOnTick(method: AnyFn): AnyFn {
  const data: { arguments: unknown[]; result?: unknown } = { arguments: [method, {}] };
  tracingChannel<{ arguments: unknown[]; result?: unknown }>(CHANNELS.NESTJS_SCHEDULE_EXPLORER_WRAP).traceSync(
    () => async () => {},
    data,
  );
  return data.result as AnyFn;
}

const isMarkedMonitored = (onTick: AnyFn): boolean =>
  !!(onTick as AnyFn & Record<symbol, unknown>)[Symbol.for('sentry.cron.monitored')];

function sentCheckIns(): Array<[string, string, unknown]> {
  return captureCheckIn.mock.calls.map(([checkIn, config]) => [checkIn.monitorSlug, checkIn.status, config]);
}

describe('@Cron() monitoring', () => {
  beforeEach(() => {
    subscribeToNestChannels();
  });

  afterEach(() => {
    SentryCore.getMainCarrier().__SENTRY__ = undefined;
    vi.restoreAllMocks();
  });

  it('sends check-ins with the schedule, using the @Cron() name as slug', () => {
    initClient({ monitorCronJobs: true });
    decorate('Jobs', [cron('0 30 9 * * 1-5', { name: 'daily-report', timeZone: 'Europe/Vienna' })])();

    expect(sentCheckIns()).toEqual([
      [
        'daily-report',
        'in_progress',
        { schedule: { type: 'crontab', value: '30 9 * * 1-5' }, timezone: 'Europe/Vienna' },
      ],
      ['daily-report', 'ok', undefined],
    ]);
  });

  it('uses ClassName.methodName without a name', () => {
    initClient({ monitorCronJobs: true });
    decorate('Jobs', [cron('* * * * *', { timeZone: 'UTC' })])();

    expect(sentCheckIns()[0]?.[0]).toBe('Jobs.run');
  });

  it('sends error check-ins and rethrows', async () => {
    initClient({ monitorCronJobs: true });
    vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');
    const target = Object.create({ constructor: { name: 'Jobs' } }) as object;
    const descriptor: PropertyDescriptor = {
      value: async function run(): Promise<never> {
        throw new Error('boom');
      },
    };
    cron('* * * * *', { timeZone: 'UTC' })(target, 'run', descriptor);

    await expect((descriptor.value as AnyFn)()).rejects.toThrow('boom');
    expect(sentCheckIns().map(([, status]) => status)).toEqual(['in_progress', 'error']);
  });

  it('checks in without a config when the schedule cannot be sent', () => {
    initClient({ monitorCronJobs: true });
    decorate('Jobs', [cron('*/10 * * * * *', { name: 'every-10s' })])();

    expect(sentCheckIns()[0]).toEqual(['every-10s', 'in_progress', undefined]);
  });

  it('does not monitor by default', () => {
    initClient({});
    decorate('Jobs', [cron('* * * * *', { name: 'job' })])();

    expect(captureCheckIn).not.toHaveBeenCalled();
  });

  it('skips excluded jobs', () => {
    initClient({ monitorCronJobs: true, excludeCronJobs: ['job', /^Other\./] });
    decorate('Jobs', [cron('* * * * *', { name: 'job' })])();
    decorate('Other', [cron('* * * * *')])();
    decorate('Jobs', [cron('* * * * *', { name: 'job-2' })])();

    expect(sentCheckIns().map(([slug]) => slug)).toEqual(['job-2', 'job-2']);
  });

  it('skips one-off jobs', () => {
    initClient({ monitorCronJobs: true });
    decorate('Jobs', [cron(new Date(), { name: 'once' })])();

    expect(captureCheckIn).not.toHaveBeenCalled();
  });

  it.each([
    ['@Cron() above @SentryCron()', (c: MethodDecorator, s: MethodDecorator) => [c, s]],
    ['@SentryCron() above @Cron()', (c: MethodDecorator, s: MethodDecorator) => [s, c]],
  ])('only sends the @SentryCron() check-ins with %s', async (_, order) => {
    initClient({ monitorCronJobs: true });
    await decorate('Jobs', order(cron('* * * * *', { name: 'job' }), SentryCron('explicit-slug')))();

    expect(sentCheckIns().map(([slug]) => slug)).toEqual(['explicit-slug', 'explicit-slug']);
  });

  describe('marks the CronJob onTick so the cron package integration skips it', () => {
    it('when the method is monitored', () => {
      initClient({ monitorCronJobs: true });
      const onTick = cronJobOnTick(decorate('Jobs', [cron('* * * * *', { name: 'job' })]));

      expect(isMarkedMonitored(onTick)).toBe(true);
      expect(Object.keys(onTick)).toEqual([]);
    });

    it('when a decorator above @Cron() replaces the method', () => {
      initClient({ monitorCronJobs: true });
      const onTick = cronJobOnTick(decorate('Jobs', [wrapMethod, cron('* * * * *', { name: 'job' })]));

      expect(isMarkedMonitored(onTick)).toBe(true);
    });

    it.each([
      ['@SentryCron(), another decorator, @Cron()', (c: MethodDecorator, s: MethodDecorator) => [s, wrapMethod, c]],
      ['another decorator, @SentryCron(), @Cron()', (c: MethodDecorator, s: MethodDecorator) => [wrapMethod, s, c]],
      ['another decorator, @Cron(), @SentryCron()', (c: MethodDecorator, s: MethodDecorator) => [wrapMethod, c, s]],
    ])('when the method has %s', (_, order) => {
      initClient({});
      const onTick = cronJobOnTick(
        decorate('Jobs', order(cron('* * * * *', { name: 'job' }), SentryCron('explicit-slug'))),
      );

      expect(isMarkedMonitored(onTick)).toBe(true);
    });

    it('not when a decorator above @Cron() replaces an excluded method', () => {
      initClient({ monitorCronJobs: true, excludeCronJobs: ['job'] });
      const onTick = cronJobOnTick(decorate('Jobs', [wrapMethod, cron('* * * * *', { name: 'job' })]));

      expect(isMarkedMonitored(onTick)).toBe(false);
    });

    it('when the method has @SentryCron()', () => {
      initClient({});
      const onTick = cronJobOnTick(decorate('Jobs', [cron('* * * * *', { name: 'job' }), SentryCron('explicit-slug')]));

      expect(isMarkedMonitored(onTick)).toBe(true);
    });

    it.each([
      ['monitorCronJobs is off', {}],
      ['the job is excluded', { monitorCronJobs: true, excludeCronJobs: ['job'] }],
    ])('not when %s', (_, options) => {
      initClient(options);
      const onTick = cronJobOnTick(decorate('Jobs', [cron('* * * * *', { name: 'job' })]));

      expect(isMarkedMonitored(onTick)).toBe(false);
    });

    it('not for other scheduled methods', () => {
      initClient({ monitorCronJobs: true });

      expect(isMarkedMonitored(cronJobOnTick(function interval(): void {}))).toBe(false);
    });
  });
});
