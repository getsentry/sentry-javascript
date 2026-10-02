// Note: These tests run the handler in Node.js, which has some differences to the cloudflare workers runtime.
// Although this is not ideal, this is the best we can do until we have a better way to test cloudflare workers.

import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types';
import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import type { CloudflareOptions } from '../../../src/client';
import { CloudflareClient } from '../../../src/client';
import {
  instrumentWorkerEntrypoint,
  type WorkerEntrypointConstructor,
} from '../../../src/instrumentations/instrumentWorkerEntrypoint';
import { withSentry } from '../../../src/withSentry';
import { resetSdk } from '../../testUtils';

const MOCK_ENV = {
  SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337',
  SENTRY_RELEASE: '1.1.1',
};

const MOCK_ENV_WITHOUT_DSN = {
  SENTRY_RELEASE: '1.1.1',
};

function createMockExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}

function createMockScheduledController(): ScheduledController {
  return {
    scheduledTime: 123,
    cron: '0 0 0 * * *',
    noRetry: vi.fn(),
  };
}

function addDelayedWaitUntil(context: ExecutionContext) {
  context.waitUntil(new Promise<void>(resolve => setTimeout(() => resolve())));
}

describe('instrumentScheduled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSdk();
  });

  test('does not double-wrap when withSentry is called twice', async () => {
    const originalScheduled = vi.fn();
    const handler = {
      scheduled: originalScheduled,
    } satisfies ExportedHandler<typeof MOCK_ENV>;

    const optionsCallback = vi.fn().mockReturnValue({ dsn: MOCK_ENV.SENTRY_DSN });

    const wrappedHandler1 = withSentry(optionsCallback, handler);
    const firstScheduled = wrappedHandler1.scheduled;

    const wrappedHandler2 = withSentry(optionsCallback, handler);
    const secondScheduled = wrappedHandler2.scheduled;

    expect(firstScheduled).toBe(secondScheduled);
  });

  test('executes options callback with env', async () => {
    const handler = {
      scheduled(_controller, _env, _context) {
        return;
      },
    } satisfies ExportedHandler<typeof MOCK_ENV>;

    const optionsCallback = vi.fn().mockReturnValue({});

    const wrappedHandler = withSentry(optionsCallback, handler);
    await wrappedHandler.scheduled?.(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());

    expect(optionsCallback).toHaveBeenCalledTimes(1);
    expect(optionsCallback).toHaveBeenLastCalledWith(MOCK_ENV);
  });

  test('merges options from env and callback', async () => {
    const handler = {
      scheduled(_controller, _env, _context) {
        SentryCore.captureMessage('cloud_resource');
        return;
      },
    } satisfies ExportedHandler<typeof MOCK_ENV>;

    let sentryEvent: Event = {};
    const wrappedHandler = withSentry(
      env => ({
        dsn: env.SENTRY_DSN,
        beforeSend(event) {
          sentryEvent = event;
          return null;
        },
      }),
      handler,
    );
    await wrappedHandler.scheduled?.(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());

    expect(sentryEvent.release).toBe('1.1.1');
  });

  test('callback options take precedence over env options', async () => {
    const handler = {
      scheduled(_controller, _env, _context) {
        SentryCore.captureMessage('cloud_resource');
        return;
      },
    } satisfies ExportedHandler<typeof MOCK_ENV>;

    let sentryEvent: Event = {};
    const wrappedHandler = withSentry(
      env => ({
        dsn: env.SENTRY_DSN,
        release: '2.0.0',
        beforeSend(event) {
          sentryEvent = event;
          return null;
        },
      }),
      handler,
    );
    await wrappedHandler.scheduled?.(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());

    expect(sentryEvent.release).toEqual('2.0.0');
  });

  test('flushes the event after the handler is done using the cloudflare context.waitUntil', async () => {
    const handler = {
      scheduled(_controller, _env, _context) {
        return;
      },
    } satisfies ExportedHandler<typeof MOCK_ENV>;

    const context = createMockExecutionContext();
    const waitUntilSpy = vi.spyOn(context, 'waitUntil');
    const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
    await wrappedHandler.scheduled?.(createMockScheduledController(), MOCK_ENV, context);

    expect(waitUntilSpy).toHaveBeenCalledTimes(1);
    expect(waitUntilSpy).toHaveBeenLastCalledWith(expect.any(Promise));
  });

  test('creates a cloudflare client and sets it on the handler', async () => {
    const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind');
    const handler = {
      scheduled(_controller, _env, _context) {
        return;
      },
    } satisfies ExportedHandler<typeof MOCK_ENV>;

    const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
    await wrappedHandler.scheduled?.(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());

    expect(initAndBindSpy).toHaveBeenCalledTimes(1);
    expect(initAndBindSpy).toHaveBeenLastCalledWith(CloudflareClient, expect.any(Object));
  });

  describe('scope instrumentation', () => {
    test('adds cloud resource context', async () => {
      const handler = {
        scheduled(_controller, _env, _context) {
          SentryCore.captureMessage('cloud_resource');
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      let sentryEvent: Event = {};
      const wrappedHandler = withSentry(
        env => ({
          dsn: env.SENTRY_DSN,
          beforeSend(event) {
            sentryEvent = event;
            return null;
          },
        }),
        handler,
      );
      await wrappedHandler.scheduled?.(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());

      expect(sentryEvent.contexts?.cloud_resource).toEqual({ 'cloud.provider': 'cloudflare' });
    });
  });

  describe('error instrumentation', () => {
    test('captures errors thrown by the handler', async () => {
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
      const error = new Error('test');

      expect(captureExceptionSpy).not.toHaveBeenCalled();

      const handler = {
        scheduled(_controller, _env, _context) {
          throw error;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
      try {
        await wrappedHandler.scheduled?.(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());
      } catch {
        // ignore
      }

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenLastCalledWith(error, {
        mechanism: { handled: false, type: 'auto.faas.cloudflare.scheduled' },
      });
    });

    test('re-throws the error after capturing', async () => {
      const error = new Error('test');
      const handler = {
        scheduled(_controller, _env, _context) {
          throw error;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);

      let thrownError: Error | undefined;
      try {
        await wrappedHandler.scheduled?.(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());
      } catch (e: any) {
        thrownError = e;
      }

      expect(thrownError).toBe(error);
    });
  });

  describe('tracing instrumentation', () => {
    test('creates a span that wraps scheduled invocation', async () => {
      const handler = {
        scheduled(_controller, _env, _context) {
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      let sentryEvent: Event = {};
      const wrappedHandler = withSentry(
        env => ({
          dsn: env.SENTRY_DSN,
          tracesSampleRate: 1,
          traceLifecycle: 'static',
          beforeSendTransaction(event) {
            sentryEvent = event;
            return null;
          },
        }),
        handler,
      );

      await wrappedHandler.scheduled?.(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());

      expect(sentryEvent.transaction).toEqual('Scheduled Cron 0 0 0 * * *');
      expect(sentryEvent.spans).toHaveLength(0);
      expect(sentryEvent.contexts?.trace).toEqual({
        data: {
          'sentry.origin': 'auto.faas.cloudflare.scheduled',
          'sentry.op': 'function',
          'sentry.description': 'Scheduled Cron 0 0 0 * * *',
          'code.function.name': 'scheduled',
          'faas.cron': '0 0 0 * * *',
          'faas.time': expect.any(String),
          'faas.trigger': 'timer',
          'sentry.sample_rate': 1,
          'sentry.segment.name.source': 'task',
        },
        op: 'function',
        origin: 'auto.faas.cloudflare.scheduled',
        status: 'ok',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      });
    });

    async function spanNameFor(traceLifecycle: 'static' | 'stream'): Promise<string | undefined> {
      let spanName: string | undefined;

      const handler = {
        scheduled(_controller, _env, _context) {
          // Read the name while the handler is in flight: the gate applies at span start.
          const activeSpan = SentryCore.getActiveSpan();
          spanName = activeSpan ? SentryCore.spanToJSON(SentryCore.getRootSpan(activeSpan)).name : undefined;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN, tracesSampleRate: 1, traceLifecycle }), handler);

      await wrappedHandler.scheduled?.(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());

      return spanName;
    }

    test('keeps the cron out of the span name when span streaming is enabled', async () => {
      expect(await spanNameFor('stream')).toBe('scheduled');
    });

    test('keeps the descriptive span name when span streaming is disabled', async () => {
      expect(await spanNameFor('static')).toBe('Scheduled Cron 0 0 0 * * *');
    });
  });

  describe('cron monitoring', () => {
    function controllerFor(cron: string): ScheduledController {
      return { scheduledTime: 123, cron, noRetry: vi.fn() };
    }

    async function runScheduled(
      monitorCronTriggers: CloudflareOptions['monitorCronTriggers'],
      scheduled: ExportedHandler<typeof MOCK_ENV>['scheduled'] = () => {},
      cron = '30 9 * * 1-5',
    ): Promise<void> {
      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN, monitorCronTriggers }), { scheduled });
      await wrappedHandler.scheduled?.(controllerFor(cron), MOCK_ENV, createMockExecutionContext());
    }

    async function getInProgressCheckIn(
      cron: string,
      monitorCronTriggers: CloudflareOptions['monitorCronTriggers'] = true,
    ): Promise<unknown[]> {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');
      await runScheduled(monitorCronTriggers, undefined, cron);
      return captureCheckInSpy.mock.calls[0] as unknown[];
    }

    test('sends no check-ins by default', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');

      await runScheduled(undefined);

      expect(captureCheckInSpy).not.toHaveBeenCalled();
    });

    test('sends check-ins with the cron schedule when enabled', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');

      await runScheduled(true);

      expect(captureCheckInSpy).toHaveBeenCalledTimes(2);
      expect(captureCheckInSpy).toHaveBeenNthCalledWith(
        1,
        { monitorSlug: 'cron-30-9-x-x-1to5', status: 'in_progress' },
        { schedule: { type: 'crontab', value: '30 9 * * SUN-THU' } },
      );
      expect(captureCheckInSpy).toHaveBeenNthCalledWith(2, {
        monitorSlug: 'cron-30-9-x-x-1to5',
        status: 'ok',
        checkInId: expect.any(String),
        duration: expect.any(Number),
      });
    });

    test('marks the check-in as failed when the handler throws', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');

      await expect(
        runScheduled(true, () => {
          throw new Error('test');
        }),
      ).rejects.toThrow('test');

      expect(captureCheckInSpy).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error' }));
    });

    test('uses the slug returned by a function', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');
      const getSlug = vi.fn().mockReturnValue('weekday-report');

      await runScheduled(getSlug);

      expect(getSlug).toHaveBeenCalledWith('30 9 * * 1-5');
      expect(captureCheckInSpy).toHaveBeenNthCalledWith(
        1,
        { monitorSlug: 'weekday-report', status: 'in_progress' },
        { schedule: { type: 'crontab', value: '30 9 * * SUN-THU' } },
      );
    });

    test('sends the monitor settings returned by a function', async () => {
      const [, monitorConfig] = await getInProgressCheckIn('0 0 * * *', () => ({
        slug: 'nightly',
        checkinMargin: 5,
        maxRuntime: 30,
      }));

      expect(monitorConfig).toEqual({
        schedule: { type: 'crontab', value: '0 0 * * *' },
        checkinMargin: 5,
        maxRuntime: 30,
      });
    });

    test('sends no check-ins and still runs the handler when the function throws', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');
      const warnSpy = vi.spyOn(SentryCore.debug, 'warn').mockImplementation(() => undefined);
      const scheduled = vi.fn();

      await runScheduled(() => {
        throw new Error('slug error');
      }, scheduled);

      expect(scheduled).toHaveBeenCalledTimes(1);
      expect(captureCheckInSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('`monitorCronTriggers` threw'), expect.any(Error));
    });

    test('sends no check-ins for a run without a cron expression', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');
      const scheduled = vi.fn();

      await runScheduled(true, scheduled, '');

      expect(scheduled).toHaveBeenCalledTimes(1);
      expect(captureCheckInSpy).not.toHaveBeenCalled();
    });

    test.each([
      ['1', 'SUN'],
      ['7', 'SAT'],
      ['2,4,6', 'MON,WED,FRI'],
      ['2-6', 'MON-FRI'],
      ['1-7/2', 'SUN-SAT/2'],
      ['2/3', 'MON-SAT/3'],
      ['7/1', 'SAT'],
      ['3-3/2', 'TUE'],
      ['*/2', 'SUN-SAT/2'],
      ['*', '*'],
      ['mon-fri', 'MON-FRI'],
      ['SAT,1', 'SAT,SUN'],
      ['6L', '5L'],
      ['FRIL', '5L'],
      ['6#2', 'FRI#2'],
      ['MON#1', 'MON#1'],
    ])('converts the weekday field %s to %s', async (weekdays, expected) => {
      const [, monitorConfig] = await getInProgressCheckIn(`0 9 * * ${weekdays}`);

      expect(monitorConfig).toEqual({ schedule: { type: 'crontab', value: `0 9 * * ${expected}` } });
    });

    test.each([['0'], ['8'], ['6-2'], ['L'], ['?'], ['1-*'], ['2/0'], ['6#6']])(
      'sends check-ins without a schedule for the weekday field %s',
      async weekdays => {
        const [checkIn, monitorConfig] = await getInProgressCheckIn(`0 9 * * ${weekdays}`);

        expect(checkIn).toEqual(expect.objectContaining({ status: 'in_progress' }));
        expect(monitorConfig).toBeUndefined();
      },
    );

    test('sends check-ins without a schedule for an expression without five fields', async () => {
      const [, monitorConfig] = await getInProgressCheckIn('0 0 9 * * *');

      expect(monitorConfig).toBeUndefined();
    });

    test.each([
      ['0 9 * * 1,5', 'cron-0-9-x-x-1_5'],
      ['0 9 * * 1-5', 'cron-0-9-x-x-1to5'],
      ['*/15 * * * *', 'cron-xby15-x-x-x-x'],
      ['0  9 * * MON', 'cron-0-9-x-x-mon'],
    ])('derives the slug for %s as %s', async (cron, slug) => {
      const [checkIn] = await getInProgressCheckIn(cron);

      expect(checkIn).toEqual(expect.objectContaining({ monitorSlug: slug }));
    });

    test('derives different slugs for expressions that differ only in separators', async () => {
      const crons = ['0 9 * * 1,5', '0 9 * * 1-5', '0 9 * * 1/5', '0 9 * * 1#5'];
      const slugs = [];
      for (const cron of crons) {
        const [checkIn] = await getInProgressCheckIn(cron);
        slugs.push((checkIn as { monitorSlug: string }).monitorSlug);
        vi.restoreAllMocks();
      }

      expect(new Set(slugs).size).toBe(crons.length);
      expect(slugs[3]).toMatch(/^cron-0-9-x-x-1-5-[a-z0-9]{6}$/);
    });

    test('shortens long slugs and appends a hash', async () => {
      const minutes = Array.from({ length: 30 }, (_, i) => i).join(',');
      const [first] = await getInProgressCheckIn(`${minutes} * * * *`);
      vi.restoreAllMocks();
      const [second] = await getInProgressCheckIn(`${minutes},59 * * * *`);

      const firstSlug = (first as { monitorSlug: string }).monitorSlug;
      const secondSlug = (second as { monitorSlug: string }).monitorSlug;
      expect(firstSlug.length).toBeLessThanOrEqual(50);
      expect(firstSlug).toMatch(/^cron-0_1_2_.*-[a-z0-9]{6}$/);
      expect(secondSlug).not.toBe(firstSlug);
    });

    test('marks the check-in as failed when the handler rejects', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');

      await expect(runScheduled(true, () => Promise.reject(new Error('rejected')))).rejects.toThrow('rejected');

      expect(captureCheckInSpy).toHaveBeenCalledTimes(2);
      expect(captureCheckInSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ monitorSlug: 'cron-30-9-x-x-1to5', status: 'error' }),
      );
    });

    test('sends check-ins for the scheduled method of a WorkerEntrypoint', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');
      const TestEntrypoint = class {
        scheduled() {}
      };
      const instrumented = instrumentWorkerEntrypoint(
        () => ({ dsn: MOCK_ENV.SENTRY_DSN, monitorCronTriggers: true }),
        TestEntrypoint as unknown as WorkerEntrypointConstructor,
      );
      const entrypoint = Reflect.construct(instrumented, [createMockExecutionContext(), MOCK_ENV]);

      await entrypoint.scheduled(controllerFor('30 9 * * 1-5'));

      expect(captureCheckInSpy).toHaveBeenCalledTimes(2);
      expect(captureCheckInSpy).toHaveBeenNthCalledWith(
        1,
        { monitorSlug: 'cron-30-9-x-x-1to5', status: 'in_progress' },
        { schedule: { type: 'crontab', value: '30 9 * * SUN-THU' } },
      );
      expect(captureCheckInSpy).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ok' }));
    });

    test('sends no check-ins when the function returns undefined', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');

      await runScheduled(() => undefined);

      expect(captureCheckInSpy).not.toHaveBeenCalled();
    });

    test('flushes both check-ins before the invocation ends', async () => {
      const sentItemTypes: string[] = [];
      const handler = {
        scheduled() {},
      } satisfies ExportedHandler<typeof MOCK_ENV>;
      const wrappedHandler = withSentry(
        env => ({
          dsn: env.SENTRY_DSN,
          cacheClient: false,
          monitorCronTriggers: true,
          transport: () => ({
            send: async envelope => {
              sentItemTypes.push(...envelope[1].map(([itemHeader]) => itemHeader.type));
              return {};
            },
            flush: async () => true,
          }),
        }),
        handler,
      );

      const waits: Promise<unknown>[] = [];
      await wrappedHandler.scheduled?.(controllerFor('30 9 * * 1-5'), MOCK_ENV, {
        waitUntil: vi.fn(promise => waits.push(promise)),
        passThroughOnException: vi.fn(),
      } as unknown as ExecutionContext);
      await Promise.all(waits);

      expect(sentItemTypes.filter(type => type === 'check_in')).toHaveLength(2);
    });
  });

  test('flush must be called when all waitUntil are done', async () => {
    const flush = vi.spyOn(SentryCore.Client.prototype, 'flush');
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const handler = {
      scheduled(_controller, _env, _context) {
        addDelayedWaitUntil(_context);
        return;
      },
    } satisfies ExportedHandler<typeof MOCK_ENV_WITHOUT_DSN>;

    const wrappedHandler = withSentry(() => ({ cacheClient: false }), handler);
    const waits: Promise<unknown>[] = [];
    const waitUntil = vi.fn(promise => waits.push(promise));
    await wrappedHandler.scheduled?.(createMockScheduledController(), MOCK_ENV_WITHOUT_DSN, {
      waitUntil,
    } as unknown as ExecutionContext);
    expect(flush).not.toBeCalled();
    expect(waitUntil).toBeCalled();
    vi.advanceTimersToNextTimer().runAllTimers();
    await Promise.all(waits);
    expect(flush).toHaveBeenCalledOnce();
  });
});
