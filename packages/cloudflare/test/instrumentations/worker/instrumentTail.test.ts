// Note: These tests run the handler in Node.js, which has some differences to the cloudflare workers runtime.
// Although this is not ideal, this is the best we can do until we have a better way to test cloudflare workers.

import type { ExecutionContext, TraceItem } from '@cloudflare/workers-types';
import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CloudflareClient } from '../../../src/client';
import { withSentry } from '../../../src/withSentry';
import { resetSdk } from '../../testUtils';

const MOCK_ENV = {
  SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337',
  SENTRY_RELEASE: '1.1.1',
};

function createMockExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
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

describe('instrumentTail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSdk();
  });

  test('does not double-wrap when withSentry is called twice', async () => {
    const originalTail = vi.fn();
    const handler = {
      tail: originalTail,
    } satisfies ExportedHandler<typeof MOCK_ENV>;

    const optionsCallback = vi.fn().mockReturnValue({ dsn: MOCK_ENV.SENTRY_DSN });

    const wrappedHandler1 = withSentry(optionsCallback, handler);
    const firstTail = wrappedHandler1.tail;

    const wrappedHandler2 = withSentry(optionsCallback, handler);
    const secondTail = wrappedHandler2.tail;

    expect(firstTail).toBe(secondTail);
  });

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
    let clientInsideHandler: SentryCore.Client | undefined;
    const handler = {
      tail(_event, _env, _context) {
        clientInsideHandler = SentryCore.getClient();
        return;
      },
    } satisfies ExportedHandler<typeof MOCK_ENV>;

    const wrappedHandler = withSentry(env => ({ dsn: env.SENTRY_DSN }), handler);
    await wrappedHandler.tail?.(createMockTailEvent(), MOCK_ENV, createMockExecutionContext());

    expect(clientInsideHandler).toBeInstanceOf(CloudflareClient);
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
});
