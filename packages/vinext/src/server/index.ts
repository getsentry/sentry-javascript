/* eslint-disable import/export */
import type { EventProcessor } from '@sentry/core';
import { applySdkMetadata, consoleSandbox, getClient, getGlobalScope } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations, init as nodeInit } from '@sentry/node';
import { DEBUG_BUILD } from '../common/debug-build';

export type { NodeOptions };

/** Inits the Sentry vinext SDK on the Node.js server. */
export function init(options: NodeOptions): NodeClient | undefined {
  if (sdkAlreadyInitialized()) {
    DEBUG_BUILD &&
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn('[@sentry/vinext] SDK already initialized on the server.');
      });
    return;
  }

  const opts: NodeOptions = {
    environment: options.environment || process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'vinext', ['vinext', 'node']);

  const client = nodeInit(opts);

  getGlobalScope().addEventProcessor(
    Object.assign(
      (event => {
        if (event.type === 'transaction') {
          if (event.transaction?.match(/\/__vinext\//)) {
            return null;
          }

          if (
            event.transaction === '/404' ||
            event.transaction?.match(/^(GET|HEAD|POST|PUT|DELETE|CONNECT|OPTIONS|TRACE|PATCH) \/(404|_not-found)$/)
          ) {
            return null;
          }
        }

        return event;
      }) satisfies EventProcessor,
      { id: 'VinextLowQualityTransactionsFilter' },
    ),
  );

  getGlobalScope().addEventProcessor(
    Object.assign(
      ((event, hint) => {
        if (event.type !== undefined) {
          return event;
        }

        const originalException = hint.originalException;

        const isPostponeError =
          typeof originalException === 'object' &&
          originalException !== null &&
          '$$typeof' in originalException &&
          originalException.$$typeof === Symbol.for('react.postpone');

        if (isPostponeError) {
          return null;
        }

        const exceptionMessage = event.exception?.values?.[0]?.value;
        if (
          exceptionMessage?.includes('Suspense Exception: This is not a real error!') ||
          exceptionMessage?.includes('Suspense Exception: This is not a real error, and should not leak')
        ) {
          return null;
        }

        return event;
      }) satisfies EventProcessor,
      { id: 'VinextDropReactControlFlowErrors' },
    ),
  );

  return client;
}

function sdkAlreadyInitialized(): boolean {
  return !!getClient();
}

export { captureRequestError } from './captureRequestError';

export * from '../common';

export * from '@sentry/node';
