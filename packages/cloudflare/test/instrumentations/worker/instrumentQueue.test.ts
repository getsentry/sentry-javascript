// Note: These tests run the handler in Node.js, which has some differences to the cloudflare workers runtime.
// Although this is not ideal, this is the best we can do until we have a better way to test cloudflare workers.

import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { CloudflareClient } from '../../../src/client';
import { withSentry } from '../../../src/withSentry';

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

function createMockQueueBatch(): MessageBatch<unknown> {
  return {
    queue: 'test-queue',
    messages: [
      {
        id: '1',
        timestamp: new Date(),
        body: 'test message 1',
        attempts: 1,
        retry: vi.fn(),
        ack: vi.fn(),
      },
      {
        id: '2',
        timestamp: new Date(),
        body: 'test message 2',
        attempts: 2,
        retry: vi.fn(),
        ack: vi.fn(),
      },
    ],
    retryAll: vi.fn(),
    ackAll: vi.fn(),
  };
}

function addDelayedWaitUntil(context: ExecutionContext) {
  context.waitUntil(new Promise<void>(resolve => setTimeout(() => resolve())));
}

describe('instrumentQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('executes options callback with env', async () => {
    const handler = {
      queue(_batch, _env, _context) {
        return;
      },
    } satisfies ExportedHandler<typeof MOCK_ENV>;

    const optionsCallback = vi.fn().mockReturnValue({});

    const wrappedHandler = withSentry(optionsCallback, handler);
    await wrappedHandler.queue?.(createMockQueueBatch(), MOCK_ENV, createMockExecutionContext());

    expect(optionsCallback).toHaveBeenCalledTimes(1);
    expect(optionsCallback).toHaveBeenLastCalledWith(MOCK_ENV);
  });

  test('merges options from env and callback', async () => {
    const handler = {
      queue(_batch, _env, _context) {
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
    await wrappedHandler.queue?.(createMockQueueBatch(), MOCK_ENV, createMockExecutionContext());

    expect(sentryEvent.release).toBe('1.1.1');
  });

  test('callback options take precedence over env options', async () => {
    const handler = {
      queue(_batch, _env, _context) {
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
    await wrappedHandler.queue?.(createMockQueueBatch(), MOCK_ENV, createMockExecutionContext());

    expect(sentryEvent.release).toEqual('2.0.0');
  });

  test('flushes the event after the handler is done using the cloudflare context.waitUntil', async () => {
    const handler = {
      queue(_batch, _env, _context) {
        return;
      },
    } satisfies ExportedHandler<typeof MOCK_ENV>;

    const context = createMockExecutionContext();
    const waitUntilSpy = vi.spyOn(context, 'waitUntil');
    const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
    await wrappedHandler.queue?.(createMockQueueBatch(), MOCK_ENV, context);

    expect(waitUntilSpy).toHaveBeenCalledTimes(1);
    expect(waitUntilSpy).toHaveBeenLastCalledWith(expect.any(Promise));
  });

  test('creates a cloudflare client and sets it on the handler', async () => {
    const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind');
    const handler = {
      queue(_batch, _env, _context) {
        return;
      },
    } satisfies ExportedHandler<typeof MOCK_ENV>;

    const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
    await wrappedHandler.queue?.(createMockQueueBatch(), MOCK_ENV, createMockExecutionContext());

    expect(initAndBindSpy).toHaveBeenCalledTimes(1);
    expect(initAndBindSpy).toHaveBeenLastCalledWith(CloudflareClient, expect.any(Object));
  });

  describe('scope instrumentation', () => {
    test('adds cloud resource context', async () => {
      const handler = {
        queue(_batch, _env, _context) {
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
      await wrappedHandler.queue?.(createMockQueueBatch(), MOCK_ENV, createMockExecutionContext());

      expect(sentryEvent.contexts?.cloud_resource).toEqual({ 'cloud.provider': 'cloudflare' });
    });
  });

  describe('error instrumentation', () => {
    test('captures errors thrown by the handler', async () => {
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
      const error = new Error('test');

      expect(captureExceptionSpy).not.toHaveBeenCalled();

      const handler = {
        queue(_batch, _env, _context) {
          throw error;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
      try {
        await wrappedHandler.queue?.(createMockQueueBatch(), MOCK_ENV, createMockExecutionContext());
      } catch {
        // ignore
      }

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenLastCalledWith(error, {
        mechanism: { handled: false, type: 'auto.faas.cloudflare.queue' },
      });
    });

    test('re-throws the error after capturing', async () => {
      const error = new Error('test');
      const handler = {
        queue(_batch, _env, _context) {
          throw error;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);

      let thrownError: Error | undefined;
      try {
        await wrappedHandler.queue?.(createMockQueueBatch(), MOCK_ENV, createMockExecutionContext());
      } catch (e: any) {
        thrownError = e;
      }

      expect(thrownError).toBe(error);
    });
  });

  describe('tracing instrumentation', () => {
    test('creates a span that wraps queue invocation with correct attributes', async () => {
      const handler = {
        queue(_batch, _env, _context) {
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      let sentryEvent: Event = {};
      const wrappedHandler = withSentry(
        env => ({
          dsn: env.SENTRY_DSN,
          tracesSampleRate: 1,
          beforeSendTransaction(event) {
            sentryEvent = event;
            return null;
          },
        }),
        handler,
      );

      const batch = createMockQueueBatch();
      await wrappedHandler.queue?.(batch, MOCK_ENV, createMockExecutionContext());

      expect(sentryEvent.transaction).toEqual(`process ${batch.queue}`);
      expect(sentryEvent.spans).toHaveLength(0);
      expect(sentryEvent.contexts?.trace).toEqual({
        data: {
          'sentry.origin': 'auto.faas.cloudflare.queue',
          'sentry.op': 'queue.process',
          'faas.trigger': 'pubsub',
          'messaging.destination.name': batch.queue,
          'messaging.system': 'cloudflare',
          'messaging.batch.message_count': batch.messages.length,
          'messaging.message.retry.count': batch.messages.reduce((acc, message) => acc + message.attempts - 1, 0),
          'sentry.sample_rate': 1,
          'sentry.source': 'task',
        },
        op: 'queue.process',
        origin: 'auto.faas.cloudflare.queue',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      });
    });
  });

  test('flush must be called when all waitUntil are done', async () => {
    const flush = vi.spyOn(SentryCore.Client.prototype, 'flush');
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const handler = {
      queue(_controller, _env, _context) {
        addDelayedWaitUntil(_context);
        return;
      },
    } satisfies ExportedHandler<typeof MOCK_ENV_WITHOUT_DSN>;

    const wrappedHandler = withSentry(vi.fn(), handler);
    const waits: Promise<unknown>[] = [];
    const waitUntil = vi.fn(promise => waits.push(promise));
    await wrappedHandler.queue?.(createMockQueueBatch(), MOCK_ENV_WITHOUT_DSN, {
      waitUntil,
    } as unknown as ExecutionContext);
    expect(flush).not.toBeCalled();
    expect(waitUntil).toBeCalled();
    vi.advanceTimersToNextTimer().runAllTimers();
    await Promise.all(waits);
    expect(flush).toHaveBeenCalledOnce();
  });
});
