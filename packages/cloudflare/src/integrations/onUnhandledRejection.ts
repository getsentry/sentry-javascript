import type { IntegrationFn } from '@sentry/core';
import { captureException, defineIntegration, getClient } from '@sentry/core';

const INTEGRATION_NAME = 'OnUnhandledRejection' as const;

interface RejectionEventTarget {
  addEventListener?: (type: 'unhandledrejection', listener: (event: { reason: unknown }) => void) => void;
}

const _onUnhandledRejectionIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const target = globalThis as RejectionEventTarget;
      if (typeof target.addEventListener !== 'function') {
        return;
      }

      // workerd only dispatches rejections that happen during an invocation, rejections in global scope are dropped.
      // The listener runs in the async context of the rejected promise, so the invocation's scope applies.
      target.addEventListener('unhandledrejection', event => {
        if (!getClient()?.getIntegrationByName(INTEGRATION_NAME)) {
          return;
        }

        captureException(event.reason, {
          mechanism: { type: 'auto.faas.cloudflare.unhandled_rejection', handled: false },
        });
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Captures promise rejections that are not handled during an invocation, for example fire-and-forget work.
 */
export const onUnhandledRejectionIntegration = defineIntegration(_onUnhandledRejectionIntegration);
