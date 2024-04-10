import { captureException, defineIntegration } from '@sentry/core';
import { getClient } from '@sentry/core';

import type { NodeClient } from '../sdk/client';

const INTEGRATION_NAME = 'OnUncaughtException';

/**
 * Adds an exception monitor that captures global uncaught exceptions.
 */
export const onUncaughtExceptionIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setup(client: NodeClient) {
      global.process.on('uncaughtExceptionMonitor', (error, origin) => {
        if (getClient() === client) {
          // A quick note on the `origin` parameter: It may strike you as weird that we capture the error for both,
          // 'uncaughtException' AND 'unhandledRejection'. The reason for this is weird. There are some instances of
          // errors (one I found was simply calling a non defined variable as a function top-level in an ES module) that
          // are passed to the exception monitor as 'unhandledRejection', but are not being passed to our
          // UnhandledRejection integration. For this particular reason, we just capture all of the errors that are passed.
          captureException(error, {
            originalException: error,
            captureContext: {
              level: 'fatal',
            },
            mechanism: {
              handled: false,
              type: origin,
              data: {
                instrumentation: 'uncaughtExceptionMonitor',
              },
            },
          });
        }
      });
    },
  };
});
