import { captureException, defineIntegration, getClient } from '@sentry/core';
import type { Client, IntegrationFn } from '@sentry/types';
import { consoleSandbox } from '@sentry/utils';
import { logAndExitProcess } from '../utils/errorhandling';

type UnhandledRejectionMode = 'none' | 'warn' | 'strict';

interface OnUnhandledRejectionOptions {
  /**
   * Option deciding what to do after capturing unhandledRejection,
   * that mimicks behavior of node's --unhandled-rejection flag.
   */
  mode: UnhandledRejectionMode;
}

const INTEGRATION_NAME = 'OnUnhandledRejection';

const _onUnhandledRejectionIntegration = ((options: Partial<OnUnhandledRejectionOptions> = {}) => {
  const mode = options.mode || 'warn';

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      global.process.on('unhandledRejection', makeUnhandledPromiseHandler(client, { mode }));
    },
  };
}) satisfies IntegrationFn;

/**
 * Add a global promise rejection handler.
 */
export const onUnhandledRejectionIntegration = defineIntegration(_onUnhandledRejectionIntegration);

/**
 * Send an exception with reason
 * @param reason string
 * @param promise promise
 *
 * Exported only for tests.
 */
export function makeUnhandledPromiseHandler(
  client: Client,
  options: OnUnhandledRejectionOptions,
): (reason: unknown, promise: unknown) => void {
  return function sendUnhandledPromise(reason: unknown, promise: unknown): void {
    if (getClient() !== client) {
      return;
    }

    captureException(reason, {
      originalException: promise,
      captureContext: {
        extra: { unhandledPromiseRejection: true },
      },
      mechanism: {
        handled: false,
        type: 'onunhandledrejection',
      },
    });

    handleRejection(reason, options);
  };
}

/**
 * Handler for `mode` option

 */
function handleRejection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reason: any,
  options: OnUnhandledRejectionOptions,
): void {
  // https://github.com/nodejs/node/blob/7cf6f9e964aa00772965391c23acda6d71972a9a/lib/internal/process/promises.js#L234-L240
  const rejectionWarning =
    'This error originated either by ' +
    'throwing inside of an async function without a catch block, ' +
    'or by rejecting a promise which was not handled with .catch().' +
    ' The promise rejected with the reason:';

  /* eslint-disable no-console */
  if (options.mode === 'warn') {
    consoleSandbox(() => {
      console.warn(rejectionWarning);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.error(reason && reason.stack ? reason.stack : reason);
    });
  } else if (options.mode === 'strict') {
    consoleSandbox(() => {
      console.warn(rejectionWarning);
    });
    logAndExitProcess(reason);
  }
  /* eslint-enable no-console */
}
