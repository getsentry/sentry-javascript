import { getCurrentHub } from '@sentry/core';
import { logger } from '@sentry/utils';

/**
 * Log a message in debug mode, and add a breadcrumb when _experiment.traceInternals is enabled.
 */
export function logInfo(message: string, shouldAddBreadcrumb?: boolean): void {
  if (!__DEBUG_BUILD__) {
    return;
  }

  logger.info(message);

  if (shouldAddBreadcrumb) {
    // Wait a tick here to avoid race conditions for some initial logs
    // which may be added before replay is initialized
    setTimeout(() => {
      const hub = getCurrentHub();
      hub.addBreadcrumb(
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
    }, 0);
  }
}
