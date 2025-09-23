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
    return client.getIntegrationByName(_honoIntegration.name);
  }
}

// todo: implement this
function isHonoError(err: unknown): err is HonoError {
  // @ts-ignore
  return 'status' in err;
}

const _honoIntegration = ((options: Partial<Options> = {}) => {
  let _shouldHandleError: (error: Error) => boolean;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      _shouldHandleError = options.shouldHandleError || defaultShouldHandleError;
    },
    handleHonoException(err: HonoError): void {
      if (!isHonoError) {
        DEBUG_BUILD && debug.log('Hono integration could not detect a Hono error');
        return;
      }
      if (_shouldHandleError(err)) {
        captureException(err, { mechanism: { handled: false, type: 'auto.faas.cloudflare.error_handler' } });
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Automatically captures exceptions caught with the `onError` handler in Hono.
 *
 * The integration is added by default.
 */
export const honoIntegration = defineIntegration(_honoIntegration);

/**
 * Default function to determine if an error should be sent to Sentry
 *
 * 3xx and 4xx errors are not sent by default.
 */
function defaultShouldHandleError(error: HonoError): boolean {
  // todo: add test for checking error without status
  const statusCode = error?.status;
  // 3xx and 4xx errors are not sent by default.
  return statusCode ? statusCode >= 500 || statusCode <= 299 : true;
}
