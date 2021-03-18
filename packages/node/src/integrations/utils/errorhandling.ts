import { getCurrentHub } from '@sentry/core';
import { forget, logger } from '@sentry/utils';

import { NodeClient } from '../../client';

const DEFAULT_SHUTDOWN_TIMEOUT = 2000;

/**
 * @hidden
 */
export function logAndExitProcess(error: Error): void {
  // eslint-disable-next-line no-console
  console.error(error && error.stack ? error.stack : error);

  const client = getCurrentHub().getClient<NodeClient>();

  if (client === undefined) {
    logger.warn('No NodeClient was defined, we are exiting the process now.');
    global.process.exit(1);
    return;
  }

  const options = client.getOptions();
  const timeout =
    (options && options.shutdownTimeout && options.shutdownTimeout > 0 && options.shutdownTimeout) ||
    DEFAULT_SHUTDOWN_TIMEOUT;
  forget(
    client.close(timeout).then((result: boolean) => {
      if (!result) {
        logger.warn('We reached the timeout for emptying the request buffer, still exiting now!');
      }
      global.process.exit(1);
    }),
  );
}
