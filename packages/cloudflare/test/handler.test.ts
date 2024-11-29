// Note: These tests run the handler in Node.js, which has some differences to the cloudflare workers runtime.
// Although this is not ideal, this is the best we can do until we have a better way to test cloudflare workers.

import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { ScheduledController } from '@cloudflare/workers-types';
import * as SentryCore from '@sentry/core';
import type { Event } from '@sentry/core';
import { CloudflareClient } from '../src/client';
import { withSentry } from '../src/handler';

const MOCK_ENV = {
  SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337',
};

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
      await wrappedHandler.fetch(new Request('https://example.com'), MOCK_ENV, createMockExecutionContext());

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
      const result = await wrappedHandler.fetch(
        new Request('https://example.com'),
        MOCK_ENV,
        createMockExecutionContext(),
      );

      expect(result).toBe(response);
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
      await wrappedHandler.scheduled(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());

      expect(optionsCallback).toHaveBeenCalledTimes(1);
      expect(optionsCallback).toHaveBeenLastCalledWith(MOCK_ENV);
    });

    test('flushes the event after the handler is done using the cloudflare context.waitUntil', async () => {
      const handler = {
        scheduled(_controller, _env, _context) {
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const context = createMockExecutionContext();
      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
      await wrappedHandler.scheduled(createMockScheduledController(), MOCK_ENV, context);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(context.waitUntil).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(context.waitUntil).toHaveBeenLastCalledWith(expect.any(Promise));
    });

    test('creates a cloudflare client and sets it on the handler', async () => {
      const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind');
      const handler = {
        scheduled(_controller, _env, _context) {
          return;
        },
      } satisfies ExportedHandler<typeof MOCK_ENV>;

      const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
      await wrappedHandler.scheduled(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());

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
        await wrappedHandler.scheduled(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());

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
          await wrappedHandler.scheduled(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());
        } catch {
          // ignore
        }

        expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
        expect(captureExceptionSpy).toHaveBeenLastCalledWith(error, {
          mechanism: { handled: false, type: 'cloudflare' },
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
          await wrappedHandler.scheduled(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());
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

        await wrappedHandler.scheduled(createMockScheduledController(), MOCK_ENV, createMockExecutionContext());

        expect(sentryEvent.transaction).toEqual('Scheduled Cron 0 0 0 * * *');
        expect(sentryEvent.spans).toHaveLength(0);
        expect(sentryEvent.contexts?.trace).toEqual({
          data: {
            'sentry.origin': 'auto.faas.cloudflare',
            'sentry.op': 'faas.cron',
            'faas.cron': '0 0 0 * * *',
            'faas.time': expect.any(String),
            'faas.trigger': 'timer',
            'sentry.sample_rate': 1,
            'sentry.source': 'task',
          },
          op: 'faas.cron',
          origin: 'auto.faas.cloudflare',
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        });
      });
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
