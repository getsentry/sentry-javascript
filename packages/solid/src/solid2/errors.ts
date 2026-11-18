import { captureException, defineIntegration } from '@sentry/core';
import { configureClientErrors } from 'solid-js';

const INTEGRATION_NAME = 'SolidErrors';

/**
 * Captures errors that a Solid `<Errored>` boundary catches and renders a fallback for.
 * Errors no boundary catches are already captured by the browser SDK's global handlers.
 */
export const solidErrorsIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      configureClientErrors({
        onError(error, { ownerPath, boundaryPath }) {
          captureException(error, {
            mechanism: { type: 'auto.function.solid.error_boundary', handled: true },
            // Solid only fills in component names on its observe and dev builds.
            captureContext: { contexts: { solid: { owner_path: ownerPath, boundary_path: boundaryPath } } },
          });
        },
      });
    },
  };
});
