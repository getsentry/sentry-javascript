// Note: These tests run the handler in Node.js, which has some differences to the cloudflare workers runtime.
// Although this is not ideal, this is the best we can do until we have a better way to test cloudflare workers.

import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types';
import type { Event, Integration } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { CloudflareClient } from '../../../src/client';
import {
  instrumentWorkerEntrypoint,
  type WorkerEntrypointConstructor,
} from '../../../src/instrumentations/instrumentWorkerEntrypoint';
import { cronTriggersIntegration } from '../../../src/integrations/cronTriggers';
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
      integrations: Integration[],
      scheduled: ExportedHandler<typeof MOCK_ENV>['scheduled'] = () => {},
    ): Promise<void> {
      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN, integrations }), { scheduled });
      await wrappedHandler.scheduled?.(controllerFor('30 9 * * 1-5'), MOCK_ENV, createMockExecutionContext());
    }

    test('sends no check-ins without the integration', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');

      await runScheduled([]);

      expect(captureCheckInSpy).not.toHaveBeenCalled();
    });

    test('sends check-ins with the cron schedule with the integration', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');

      await runScheduled([cronTriggersIntegration()]);

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
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
      const error = new Error('test');

      await expect(
        runScheduled([cronTriggersIntegration()], () => {
          throw error;
        }),
      ).rejects.toThrow('test');

      expect(captureCheckInSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'error', duration: expect.any(Number) }),
      );
      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.faas.cloudflare.scheduled' },
      });
    });

    test('marks the check-in as failed when the handler rejects', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');

      await expect(
        runScheduled([cronTriggersIntegration()], () => Promise.reject(new Error('rejected'))),
      ).rejects.toThrow('rejected');

      expect(captureCheckInSpy).toHaveBeenCalledTimes(2);
      expect(captureCheckInSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ monitorSlug: 'cron-30-9-x-x-1to5', status: 'error' }),
      );
    });

    test('runs the handler without check-ins when the in_progress check-in throws', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn').mockImplementation(() => {
        throw new Error('check-in error');
      });
      onTestFinished(() => captureCheckInSpy.mockRestore());
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
      const scheduled = vi.fn().mockResolvedValue('result');
      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN, integrations: [cronTriggersIntegration()] }), {
        scheduled,
      } as ExportedHandler<typeof MOCK_ENV>);

      const result = await wrappedHandler.scheduled?.(
        controllerFor('30 9 * * 1-5'),
        MOCK_ENV,
        createMockExecutionContext(),
      );

      expect(result).toBe('result');
      expect(scheduled).toHaveBeenCalledTimes(1);
      expect(captureCheckInSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    test('returns the handler result when the ok check-in throws', async () => {
      const captureCheckInSpy = vi
        .spyOn(SentryCore, 'captureCheckIn')
        .mockReturnValueOnce('check-in-id')
        .mockImplementationOnce(() => {
          throw new Error('check-in error');
        });
      onTestFinished(() => captureCheckInSpy.mockRestore());
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN, integrations: [cronTriggersIntegration()] }), {
        scheduled: () => Promise.resolve('result'),
      } as unknown as ExportedHandler<typeof MOCK_ENV>);

      const result = await wrappedHandler.scheduled?.(
        controllerFor('30 9 * * 1-5'),
        MOCK_ENV,
        createMockExecutionContext(),
      );

      expect(result).toBe('result');
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    test('sends check-ins for the scheduled method of a WorkerEntrypoint', async () => {
      const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn');
      const TestEntrypoint = class {
        scheduled() {}
      };
      const instrumented = instrumentWorkerEntrypoint(
        () => ({ dsn: MOCK_ENV.SENTRY_DSN, integrations: [cronTriggersIntegration()] }),
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

    test('flushes both check-ins before the invocation ends', async () => {
      const sentItemTypes: string[] = [];
      const handler = {
        scheduled() {},
      } satisfies ExportedHandler<typeof MOCK_ENV>;
      const wrappedHandler = withSentry(
        env => ({
          dsn: env.SENTRY_DSN,
          cacheClient: false,
          integrations: [cronTriggersIntegration()],
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
