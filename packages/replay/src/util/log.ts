import { addBreadcrumb } from '@sentry/core';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';

/**
 * Log a message in debug mode, and add a breadcrumb when _experiment.traceInternals is enabled.
 */
export function logInfo(message: string, shouldAddBreadcrumb?: boolean): void {
  if (!DEBUG_BUILD) {
    return;
  }

  logger.info(message);

  if (shouldAddBreadcrumb) {
    addLogBreadcrumb(message);
  }
}

/**
 * Log a message, and add a breadcrumb in the next tick.
 * This is necessary when the breadcrumb may be added before the replay is initialized.
 */
export function logInfoNextTick(message: string, shouldAddBreadcrumb?: boolean): void {
  if (!DEBUG_BUILD) {
    return;
  }

  logger.info(message);

  if (shouldAddBreadcrumb) {
    // Wait a tick here to avoid race conditions for some initial logs
    // which may be added before replay is initialized
    setTimeout(() => {
      addLogBreadcrumb(message);
    }, 0);
  }
}

function addLogBreadcrumb(message: string): void {
  addBreadcrumb(
    {
      category: 'console',
      data: {
        logger: 'replay',
      },
      level: 'info',
      message,
    },
    { level: 'info' },
  );
}
