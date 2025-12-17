import type { IntegrationFn } from '@sentry/core';
import {
  captureException,
  debug,
  defineIntegration,
  getActiveSpan,
  getClient,
  getIsolationScope,
  getRootSpan,
  updateSpanName,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

const INTEGRATION_NAME = 'Hono';

interface HonoError extends Error {
  status?: number;
}

// Minimal type - only exported for tests
export interface HonoContext {
  req: { method: string; path?: string };
}

export interface Options {
  /**
   * Callback method deciding whether error should be captured and sent to Sentry
   * @param error Captured middleware error
   */
  shouldHandleError?(this: void, error: HonoError): boolean;
}

/** Only exported for internal use */
export function getHonoIntegration(): ReturnType<typeof _honoIntegration> | undefined {
  return getClient()?.getIntegrationByName(INTEGRATION_NAME);
}

function isHonoError(err: unknown): err is HonoError {
  if (err instanceof Error) {
    return true;
  }
  return typeof err === 'object' && err !== null && 'status' in (err as Record<string, unknown>);
}

// Vendored from https://github.com/honojs/hono/blob/d3abeb1f801aaa1b334285c73da5f5f022dbcadb/src/helper/route/index.ts#L58-L59
const routePath = (c: HonoContext): string => c.req?.path ?? '';

const _honoIntegration = ((options: Partial<Options> = {}) => {
  return {
    name: INTEGRATION_NAME,
    // Hono error handler: https://github.com/honojs/hono/blob/d3abeb1f801aaa1b334285c73da5f5f022dbcadb/src/hono-base.ts#L35
    handleHonoException(err: HonoError, context: HonoContext): void {
      const shouldHandleError = options.shouldHandleError || defaultShouldHandleError;

      if (!isHonoError(err)) {
        DEBUG_BUILD && debug.log("[Hono] Won't capture exception in `onError` because it's not a Hono error.", err);
        return;
      }

      if (shouldHandleError(err)) {
        if (context) {
          const activeSpan = getActiveSpan();
          const spanName = `${context.req.method} ${routePath(context)}`;

          if (activeSpan) {
            activeSpan.updateName(spanName);
            updateSpanName(getRootSpan(activeSpan), spanName);
          }

          getIsolationScope().setTransactionName(spanName);
        }

        captureException(err, { mechanism: { handled: false, type: 'auto.faas.hono.error_handler' } });
      } else {
        DEBUG_BUILD && debug.log('[Hono] Not capturing exception because `shouldHandleError` returned `false`.', err);
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Automatically captures exceptions caught with the `onError` handler in Hono.
 *
 * The integration is enabled by default.
 *
 * @example
 * integrations: [
 *   honoIntegration({
 *     shouldHandleError: (err) => true; // always capture exceptions in onError
 *   })
 * ]
 */
export const honoIntegration = defineIntegration(_honoIntegration);

/**
 * Default function to determine if an error should be sent to Sentry
 *
 * 3xx and 4xx errors are not sent by default.
 */
function defaultShouldHandleError(error: HonoError): boolean {
  const statusCode = error?.status;
  // 3xx and 4xx errors are not sent by default.
  return statusCode ? statusCode >= 500 || statusCode <= 299 : true;
}
