import { captureException, defineIntegration } from '@sentry/core';
import { configureServerErrors } from '@solidjs/web';

const INTEGRATION_NAME = 'SolidServerErrors';

/**
 * Captures errors that Solid's server runtime handles or fails on: a rendered `<Errored>` fallback,
 * a failed server function and a failed request.
 */
export const solidServerErrorsIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      configureServerErrors({
        // Returns nothing, so Solid's default policy decides what the client receives in place of the error.
        onError(error, { kind, handling, boundary, functionId, ownerPath, boundaryPath }) {
          captureException(error, {
            mechanism: {
              type: 'auto.function.solid.server',
              handled: handling !== 'failed',
              data: { kind, handling },
            },
            captureContext: {
              contexts: {
                solid: {
                  kind,
                  handling,
                  boundary,
                  function_id: functionId,
                  owner_path: ownerPath,
                  boundary_path: boundaryPath,
                },
              },
            },
          });
        },
      });
    },
  };
});
