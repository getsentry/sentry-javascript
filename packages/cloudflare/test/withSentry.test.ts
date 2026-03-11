// Note: These tests run the handler in Node.js, which has some differences to the cloudflare workers runtime.
// Although this is not ideal, this is the best we can do until we have a better way to test cloudflare workers.

import type { ExecutionContext } from '@cloudflare/workers-types';
import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { withSentry } from '../src/withSentry';
import { markAsInstrumented } from '../src/instrument';
import * as HonoIntegration from '../src/integrations/hono';

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

function createMockExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}

describe('withSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        onError() {},
        errorHandler(err: Error) {
          return new Response(`Error: ${err.message}`, { status: 500 });
        },
      } satisfies HonoLikeApp<typeof MOCK_ENV>;

      withSentry(env => ({ dsn: env.SENTRY_DSN }), honoApp);

      const errorHandlerResponse = honoApp.errorHandler?.(error);

      expect(handleHonoException).toHaveBeenCalledTimes(1);
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
        onError() {},
        errorHandler: originalErrorHandlerSpy,
      } satisfies HonoLikeApp<typeof MOCK_ENV>;

      withSentry(env => ({ dsn: env.SENTRY_DSN }), honoApp);

      const errorHandlerResponse = honoApp.errorHandler?.(error);

      expect(originalErrorHandlerSpy).toHaveBeenCalledTimes(1);
      expect(originalErrorHandlerSpy).toHaveBeenLastCalledWith(error);
      expect(errorHandlerResponse?.status).toBe(500);
    });

    test('does not instrument an already instrumented errorHandler', async () => {
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
      const error = new Error('test hono error');

      const originalErrorHandler = (err: Error) => {
        return new Response(`Error: ${err.message}`, { status: 500 });
      };

      markAsInstrumented(originalErrorHandler);

      const honoApp = {
        fetch(_request, _env, _context) {
          return new Response('test');
        },
        onError() {},
        errorHandler: originalErrorHandler,
      } satisfies HonoLikeApp<typeof MOCK_ENV>;

      withSentry(env => ({ dsn: env.SENTRY_DSN }), honoApp);

      honoApp.errorHandler?.(error);
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });
  });
});
