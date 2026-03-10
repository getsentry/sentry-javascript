// Note: These tests run the handler in Node.js, which has some differences to the cloudflare workers runtime.
// Although this is not ideal, this is the best we can do until we have a better way to test cloudflare workers.

import type { ExecutionContext } from '@cloudflare/workers-types';
import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
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

function addDelayedWaitUntil(context: ExecutionContext) {
  context.waitUntil(new Promise<void>(resolve => setTimeout(() => resolve())));
}

describe('instrumentFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    } satisfies ExportedHandler<typeof MOCK_ENV_WITHOUT_DSN>;

    const wrappedHandler = withSentry(vi.fn(), handler);
    const waits: Promise<unknown>[] = [];
    const waitUntil = vi.fn(promise => waits.push(promise));
    await wrappedHandler.fetch?.(new Request('https://example.com'), MOCK_ENV_WITHOUT_DSN, {
      waitUntil,
    } as unknown as ExecutionContext);
    expect(flush).not.toBeCalled();
    expect(waitUntil).toBeCalled();
    vi.advanceTimersToNextTimer().runAllTimers();
    await Promise.all(waits);
    expect(flush).toHaveBeenCalledOnce();
  });
});
