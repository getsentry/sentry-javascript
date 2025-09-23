import type { IntegrationFn } from '@sentry/core';
import { captureException, debug, defineIntegration, getClient } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

const INTEGRATION_NAME = 'Hono';

interface HonoError extends Error {
  status?: number;
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
  const client = getClient();
  if (!client) {
    return undefined;
  } else {
    return client.getIntegrationByName(INTEGRATION_NAME);
  }
}

function isHonoError(err: unknown): err is HonoError {
  if (err instanceof Error) {
    return true;
  }
  return typeof err === 'object' && err !== null && 'status' in (err as Record<string, unknown>);
}

const _honoIntegration = ((options: Partial<Options> = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {},
    handleHonoException(err: HonoError): void {
      const shouldHandleError = options.shouldHandleError || defaultShouldHandleError;

      if (!isHonoError(err)) {
        DEBUG_BUILD && debug.log("[Hono] Won't capture exception in `onError` because it's not a Hono error.", err);
        return;
      }

      if (shouldHandleError(err)) {
        captureException(err, { mechanism: { handled: false, type: 'auto.faas.cloudflare.error_handler' } });
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
