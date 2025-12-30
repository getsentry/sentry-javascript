// Note: These tests run the handler in Node.js, which has some differences to the cloudflare workers runtime.
// Although this is not ideal, this is the best we can do until we have a better way to test cloudflare workers.

import type {
  ExecutionContext,
  ForwardableEmailMessage,
  MessageBatch,
  ScheduledController,
  TraceItem,
} from '@cloudflare/workers-types';
import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { CloudflareClient } from '../src/client';
import { withSentry } from '../src/handler';
import { markAsInstrumented } from '../src/instrument';
import * as HonoIntegration from '../src/integrations/hono';

// Custom type for hono-like apps (cloudflare handlers) that include errorHandler and onError
type HonoLikeApp<Env = unknown, QueueHandlerMessage = unknown, CfHostMetadata = unknown> = ExportedHandler<
  Env,
  QueueHandlerMessage,
  CfHostMetadata
> & {
  onError?: () => void;
  errorHandler?: (err: Error) => Response;
};

const MOCK_ENV = {
  SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337',
  SENTRY_RELEASE: '1.1.1',
};

function addDelayedWaitUntil(context: ExecutionContext) {
  context.waitUntil(new Promise<void>(resolve => setTimeout(() => resolve())));
}

describe('withSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetch handler', () => {
    test('executes options callback with env', async () => {
      const handler = {
        fetch(_request, _env, _context) {
          return new Response('test');
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const optionsCallback = vi.fn().mockReturnValue({});

      const wrappedHandler = withSentry(optionsCallback, handler);
      await wrappedHandler.fetch?.(new Request('https://example.com'), MOCK_ENV, createMockExecutionContext());

      expect(optionsCallback).toHaveBeenCalledTimes(1);
      expect(optionsCallback).toHaveBeenLastCalledWith(MOCK_ENV);
    });

    test('passes through the handler response', async () => {
      const response = new Response('test');
      const handler = {
        async fetch(_request, _env, _context) {
          return response;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
      const result = await wrappedHandler.fetch?.(
        new Request('https://example.com'),
        MOCK_ENV,
        createMockExecutionContext(),
      );

      // Response may be wrapped for streaming detection, verify content
      expect(result?.status).toBe(response.status);
      if (result) {
        expect(await result.text()).toBe('test');
      }
    });

    test('merges options from env and callback', async () => {
      const handler = {
        fetch(_request, _env, _context) {
          throw new Error('test');
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

      try {
        await wrappedHandler.fetch?.(new Request('https://example.com'), MOCK_ENV, createMockExecutionContext());
      } catch {
        // ignore
      }

      expect(sentryEvent.release).toEqual('1.1.1');
    });

    test('callback options take precedence over env options', async () => {
      const handler = {
        fetch(_request, _env, _context) {
          throw new Error('test');
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

      try {
        await wrappedHandler.fetch?.(new Request('https://example.com'), MOCK_ENV, createMockExecutionContext());
      } catch {
        // ignore
      }

      expect(sentryEvent.release).toEqual('2.0.0');
    });

    test('flush must be called when all waitUntil are done', async () => {
      const flush = vi.spyOn(SentryCore.Client.prototype, 'flush');
      vi.useFakeTimers();
      onTestFinished(() => {
        vi.useRealTimers();
      });
      const handler = {
        fetch(_request, _env, _context) {
          addDelayedWaitUntil(_context);
          return new Response('test');
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(vi.fn(), handler);
      const waits: Promise<unknown>[] = [];
      const waitUntil = vi.fn(promise => waits.push(promise));
      await wrappedHandler.fetch?.(new Request('https://example.com'), MOCK_ENV, {
        waitUntil,
      } as unknown as ExecutionContext);
      expect(flush).not.toBeCalled();
      expect(waitUntil).toBeCalled();
      vi.advanceTimersToNextTimer().runAllTimers();
      await Promise.all(waits);
      expect(flush).toHaveBeenCalledOnce();
    });
  });

  describe('scheduled handler', () => {
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
            'sentry.op': 'faas.cron',
            'faas.cron': '0 0 0 * * *',
            'faas.time': expect.any(String),
            'faas.trigger': 'timer',
            'sentry.sample_rate': 1,
            'sentry.source': 'task',
          },
          op: 'faas.cron',
          origin: 'auto.faas.cloudflare.scheduled',
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
        scheduled(_controller, _env, _context) {
          addDelayedWaitUntil(_context);
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(vi.fn(), handler);
      const waits: Promise<unknown>[] = [];
      const waitUntil = vi.fn(promise => waits.push(promise));
      await wrappedHandler.scheduled?.(createMockScheduledController(), MOCK_ENV, {
        waitUntil,
      } as unknown as ExecutionContext);
      expect(flush).not.toBeCalled();
      expect(waitUntil).toBeCalled();
      vi.advanceTimersToNextTimer().runAllTimers();
      await Promise.all(waits);
      expect(flush).toHaveBeenCalledOnce();
    });
  });

  describe('email handler', () => {
    test('executes options callback with env', async () => {
      const handler = {
        email(_message, _env, _context) {
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const optionsCallback = vi.fn().mockReturnValue({});

      const wrappedHandler = withSentry(optionsCallback, handler);
      await wrappedHandler.email?.(createMockEmailMessage(), MOCK_ENV, createMockExecutionContext());

      expect(optionsCallback).toHaveBeenCalledTimes(1);
      expect(optionsCallback).toHaveBeenLastCalledWith(MOCK_ENV);
    });

    test('merges options from env and callback', async () => {
      const handler = {
        email(_message, _env, _context) {
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
      await wrappedHandler.email?.(createMockEmailMessage(), MOCK_ENV, createMockExecutionContext());

      expect(sentryEvent.release).toBe('1.1.1');
    });

    test('callback options take precedence over env options', async () => {
      const handler = {
        email(_message, _env, _context) {
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
      await wrappedHandler.email?.(createMockEmailMessage(), MOCK_ENV, createMockExecutionContext());

      expect(sentryEvent.release).toEqual('2.0.0');
    });

    test('flushes the event after the handler is done using the cloudflare context.waitUntil', async () => {
      const handler = {
        email(_message, _env, _context) {
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const context = createMockExecutionContext();
      const waitUntilSpy = vi.spyOn(context, 'waitUntil');
      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
      await wrappedHandler.email?.(createMockEmailMessage(), MOCK_ENV, context);

      expect(waitUntilSpy).toHaveBeenCalledTimes(1);
      expect(waitUntilSpy).toHaveBeenLastCalledWith(expect.any(Promise));
    });

    test('creates a cloudflare client and sets it on the handler', async () => {
      const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind');
      const handler = {
        email(_message, _env, _context) {
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
      await wrappedHandler.email?.(createMockEmailMessage(), MOCK_ENV, createMockExecutionContext());

      expect(initAndBindSpy).toHaveBeenCalledTimes(1);
      expect(initAndBindSpy).toHaveBeenLastCalledWith(CloudflareClient, expect.any(Object));
    });

    describe('scope instrumentation', () => {
      test('adds cloud resource context', async () => {
        const handler = {
          email(_message, _env, _context) {
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
        await wrappedHandler.email?.(createMockEmailMessage(), MOCK_ENV, createMockExecutionContext());

        expect(sentryEvent.contexts?.cloud_resource).toEqual({ 'cloud.provider': 'cloudflare' });
      });
    });

    describe('error instrumentation', () => {
      test('captures errors thrown by the handler', async () => {
        const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
        const error = new Error('test');

        expect(captureExceptionSpy).not.toHaveBeenCalled();

        const handler = {
          email(_message, _env, _context) {
            throw error;
          },
        } satisfies ExportedHandler<typeof MOCK_ENV>;

        const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
        try {
          await wrappedHandler.email?.(createMockEmailMessage(), MOCK_ENV, createMockExecutionContext());
        } catch {
          // ignore
        }

        expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
        expect(captureExceptionSpy).toHaveBeenLastCalledWith(error, {
          mechanism: { handled: false, type: 'auto.faas.cloudflare.email' },
        });
      });

      test('re-throws the error after capturing', async () => {
        const error = new Error('test');
        const handler = {
          email(_message, _env, _context) {
            throw error;
          },
        } satisfies ExportedHandler<typeof MOCK_ENV>;

        const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);

        let thrownError: Error | undefined;
        try {
          await wrappedHandler.email?.(createMockEmailMessage(), MOCK_ENV, createMockExecutionContext());
        } catch (e: any) {
          thrownError = e;
        }

        expect(thrownError).toBe(error);
      });
    });

    describe('tracing instrumentation', () => {
      test('creates a span that wraps email invocation', async () => {
        const handler = {
          email(_message, _env, _context) {
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

        const emailMessage = createMockEmailMessage();
        await wrappedHandler.email?.(emailMessage, MOCK_ENV, createMockExecutionContext());

        expect(sentryEvent.transaction).toEqual(`Handle Email ${emailMessage.to}`);
        expect(sentryEvent.spans).toHaveLength(0);
        expect(sentryEvent.contexts?.trace).toEqual({
          data: {
            'sentry.origin': 'auto.faas.cloudflare.email',
            'sentry.op': 'faas.email',
            'faas.trigger': 'email',
            'sentry.sample_rate': 1,
            'sentry.source': 'task',
          },
          op: 'faas.email',
          origin: 'auto.faas.cloudflare.email',
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
        email(_controller, _env, _context) {
          addDelayedWaitUntil(_context);
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(vi.fn(), handler);
      const waits: Promise<unknown>[] = [];
      const waitUntil = vi.fn(promise => waits.push(promise));
      await wrappedHandler.email?.(createMockEmailMessage(), MOCK_ENV, {
        waitUntil,
      } as unknown as ExecutionContext);
      expect(flush).not.toBeCalled();
      expect(waitUntil).toBeCalled();
      vi.advanceTimersToNextTimer().runAllTimers();
      await Promise.all(waits);
      expect(flush).toHaveBeenCalledOnce();
    });
  });

  describe('queue handler', () => {
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
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(vi.fn(), handler);
      const waits: Promise<unknown>[] = [];
      const waitUntil = vi.fn(promise => waits.push(promise));
      await wrappedHandler.queue?.(createMockQueueBatch(), MOCK_ENV, {
        waitUntil,
      } as unknown as ExecutionContext);
      expect(flush).not.toBeCalled();
      expect(waitUntil).toBeCalled();
      vi.advanceTimersToNextTimer().runAllTimers();
      await Promise.all(waits);
      expect(flush).toHaveBeenCalledOnce();
    });
  });

  describe('tail handler', () => {
    test('executes options callback with env', async () => {
      const handler = {
        tail(_event, _env, _context) {
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const optionsCallback = vi.fn().mockReturnValue({});

      const wrappedHandler = withSentry(optionsCallback, handler);
      await wrappedHandler.tail?.(createMockTailEvent(), MOCK_ENV, createMockExecutionContext());

      expect(optionsCallback).toHaveBeenCalledTimes(1);
      expect(optionsCallback).toHaveBeenLastCalledWith(MOCK_ENV);
    });

    test('merges options from env and callback', async () => {
      const handler = {
        tail(_event, _env, _context) {
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
      await wrappedHandler.tail?.(createMockTailEvent(), MOCK_ENV, createMockExecutionContext());

      expect(sentryEvent.release).toBe('1.1.1');
    });

    test('callback options take precedence over env options', async () => {
      const handler = {
        tail(_event, _env, _context) {
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
      await wrappedHandler.tail?.(createMockTailEvent(), MOCK_ENV, createMockExecutionContext());

      expect(sentryEvent.release).toEqual('2.0.0');
    });

    test('flushes the event after the handler is done using the cloudflare context.waitUntil', async () => {
      const handler = {
        tail(_event, _env, _context) {
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const context = createMockExecutionContext();
      const waitUntilSpy = vi.spyOn(context, 'waitUntil');
      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
      await wrappedHandler.tail?.(createMockTailEvent(), MOCK_ENV, context);

      expect(waitUntilSpy).toHaveBeenCalledTimes(1);
      expect(waitUntilSpy).toHaveBeenLastCalledWith(expect.any(Promise));
    });

    test('creates a cloudflare client and sets it on the handler', async () => {
      const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind');
      const handler = {
        tail(_event, _env, _context) {
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
      await wrappedHandler.tail?.(createMockTailEvent(), MOCK_ENV, createMockExecutionContext());

      expect(initAndBindSpy).toHaveBeenCalledTimes(1);
      expect(initAndBindSpy).toHaveBeenLastCalledWith(CloudflareClient, expect.any(Object));
    });

    describe('scope instrumentation', () => {
      test('adds cloud resource context', async () => {
        const handler = {
          tail(_event, _env, _context) {
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
        await wrappedHandler.tail?.(createMockTailEvent(), MOCK_ENV, createMockExecutionContext());

        expect(sentryEvent.contexts?.cloud_resource).toEqual({ 'cloud.provider': 'cloudflare' });
      });
    });

    describe('error instrumentation', () => {
      test('captures errors thrown by the handler', async () => {
        const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
        const error = new Error('test');

        expect(captureExceptionSpy).not.toHaveBeenCalled();

        const handler = {
          tail(_event, _env, _context) {
            throw error;
          },
        } satisfies ExportedHandler<typeof MOCK_ENV>;

        const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
        try {
          await wrappedHandler.tail?.(createMockTailEvent(), MOCK_ENV, createMockExecutionContext());
        } catch {
          // ignore
        }

        expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
        expect(captureExceptionSpy).toHaveBeenLastCalledWith(error, {
          mechanism: { handled: false, type: 'auto.faas.cloudflare.tail' },
        });
      });

      test('re-throws the error after capturing', async () => {
        const error = new Error('test');
        const handler = {
          tail(_event, _env, _context) {
            throw error;
          },
        } satisfies ExportedHandler<typeof MOCK_ENV>;

        const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);

        let thrownError: Error | undefined;
        try {
          await wrappedHandler.tail?.(createMockTailEvent(), MOCK_ENV, createMockExecutionContext());
        } catch (e: any) {
          thrownError = e;
        }

        expect(thrownError).toBe(error);
      });
    });

    test('flush must be called when all waitUntil are done', async () => {
      const flush = vi.spyOn(SentryCore.Client.prototype, 'flush');
      vi.useFakeTimers();
      onTestFinished(() => {
        vi.useRealTimers();
        flush.mockRestore();
      });
      const handler = {
        tail(_controller, _env, _context) {
          addDelayedWaitUntil(_context);
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(vi.fn(), handler);
      const waits: Promise<unknown>[] = [];
      const waitUntil = vi.fn(promise => waits.push(promise));
      await wrappedHandler.tail?.(createMockTailEvent(), MOCK_ENV, {
        waitUntil,
      } as unknown as ExecutionContext);
      expect(flush).not.toBeCalled();
      expect(waitUntil).toBeCalled();
      vi.advanceTimersToNextTimer().runAllTimers();
      await Promise.all(waits);
      expect(flush).toHaveBeenCalledOnce();
    });
  });

  describe('hono errorHandler', () => {
    test('calls Hono Integration to handle error captured by the errorHandler', async () => {
      const error = new Error('test hono error');

      const handleHonoException = vi.fn();
      vi.spyOn(HonoIntegration, 'getHonoIntegration').mockReturnValue({ handleHonoException } as any);

      const honoApp = {
        fetch(_request, _env, _context) {
          return new Response('test');
        },
        onError() {}, // hono-like onError
        errorHandler(err: Error) {
          return new Response(`Error: ${err.message}`, { status: 500 });
        },
      } satisfies HonoLikeApp<typeof MOCK_ENV>;

      withSentry(env => ({ dsn: env.SENTRY_DSN }), honoApp);

      // simulates hono's error handling
      const errorHandlerResponse = honoApp.errorHandler?.(error);

      expect(handleHonoException).toHaveBeenCalledTimes(1);
      // 2nd param is context, which is undefined here
      expect(handleHonoException).toHaveBeenLastCalledWith(error, undefined);
      expect(errorHandlerResponse?.status).toBe(500);
    });

    test('preserves the original errorHandler functionality', async () => {
      const originalErrorHandlerSpy = vi.fn().mockImplementation((err: Error) => {
        return new Response(`Error: ${err.message}`, { status: 500 });
      });

      const error = new Error('test hono error');

      const honoApp = {
        fetch(_request, _env, _context) {
          return new Response('test');
        },
        onError() {}, // hono-like onError
        errorHandler: originalErrorHandlerSpy,
      } satisfies HonoLikeApp<typeof MOCK_ENV>;

      withSentry(env => ({ dsn: env.SENTRY_DSN }), honoApp);

      // Call the errorHandler directly to simulate Hono's error handling
      const errorHandlerResponse = honoApp.errorHandler?.(error);

      expect(originalErrorHandlerSpy).toHaveBeenCalledTimes(1);
      expect(originalErrorHandlerSpy).toHaveBeenLastCalledWith(error);
      expect(errorHandlerResponse?.status).toBe(500);
    });

    test('does not instrument an already instrumented errorHandler', async () => {
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
      const error = new Error('test hono error');

      // Create a handler with an errorHandler that's already been instrumented
      const originalErrorHandler = (err: Error) => {
        return new Response(`Error: ${err.message}`, { status: 500 });
      };

      // Mark as instrumented before wrapping
      markAsInstrumented(originalErrorHandler);

      const honoApp = {
        fetch(_request, _env, _context) {
          return new Response('test');
        },
        onError() {}, // hono-like onError
        errorHandler: originalErrorHandler,
      } satisfies HonoLikeApp<typeof MOCK_ENV>;

      withSentry(env => ({ dsn: env.SENTRY_DSN }), honoApp);

      // The errorHandler should not have been wrapped again
      honoApp.errorHandler?.(error);
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });
  });
});

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

function createMockEmailMessage(): ForwardableEmailMessage {
  return {
    from: 'sender@example.com',
    to: 'recipient@example.com',
    raw: new ReadableStream(),
    rawSize: 1024,
    headers: new Headers(),
    setReject: vi.fn(),
    forward: vi.fn(),
    reply: vi.fn(),
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

function createMockTailEvent(): TraceItem[] {
  return [
    {
      event: {
        consumedEvents: [
          {
            scriptName: 'test-script',
          },
        ],
      },
      eventTimestamp: Date.now(),
      logs: [
        {
          timestamp: Date.now(),
          level: 'info',
          message: 'Test log message',
        },
      ],
      exceptions: [],
      diagnosticsChannelEvents: [],
      scriptName: 'test-script',
      outcome: 'ok',
      truncated: false,
    },
  ];
}
