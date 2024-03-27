import { getClient } from '@sentry/core';
import { consoleSandbox, logger } from '@sentry/utils';

import type { NodeClient } from '../../client';
import { DEBUG_BUILD } from '../../debug-build';

const DEFAULT_SHUTDOWN_TIMEOUT = 2000;

/**
 * @hidden
 */
export function logAndExitProcess(error: Error): void {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  });

  const client = getClient<NodeClient>();

  if (client === undefined) {
    DEBUG_BUILD && logger.warn('No NodeClient was defined, we are exiting the process now.');
    global.process.exit(1);
    return;
  }

  const options = client.getOptions();
  const timeout =
    (options && options.shutdownTimeout && options.shutdownTimeout > 0 && options.shutdownTimeout) ||
    DEFAULT_SHUTDOWN_TIMEOUT;
  client.close(timeout).then(
    (result: boolean) => {
      if (!result) {
        DEBUG_BUILD && logger.warn('We reached the timeout for emptying the request buffer, still exiting now!');
      }
      global.process.exit(1);
    },
    error => {
      DEBUG_BUILD && logger.error(error);
    },
  );
}
