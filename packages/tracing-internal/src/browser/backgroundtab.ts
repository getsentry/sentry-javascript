import type { SpanStatusType } from '@sentry/core';
import { getActiveSpan, getRootSpan } from '@sentry/core';
import { spanToJSON } from '@sentry/core';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../common/debug-build';
import { WINDOW } from './types';

/**
 * Add a listener that cancels and finishes a transaction when the global
 * document is hidden.
 */
export function registerBackgroundTabDetection(): void {
  if (WINDOW && WINDOW.document) {
    WINDOW.document.addEventListener('visibilitychange', () => {
      const activeSpan = getActiveSpan();
      if (!activeSpan) {
        return;
      }

      const rootSpan = getRootSpan(activeSpan);
      if (!rootSpan) {
        return;
      }

      if (WINDOW.document.hidden && activeSpan) {
        const statusType: SpanStatusType = 'cancelled';

        const { op, status } = spanToJSON(activeSpan);

        if (DEBUG_BUILD) {
          logger.log(`[Tracing] Transaction: ${statusType} -> since tab moved to the background, op: ${op}`);
        }

        // We should not set status if it is already set, this prevent important statuses like
        // error or data loss from being overwritten on transaction.
        if (!status) {
          activeSpan.setStatus(statusType);
        }

        activeSpan.setAttribute('sentry.cancellation_reason', 'document.hidden');
        activeSpan.end();
      }
    });
  } else {
    DEBUG_BUILD && logger.warn('[Tracing] Could not set up background tab detection due to lack of global document');
  }
}
