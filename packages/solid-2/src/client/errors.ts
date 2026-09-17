import { captureException, defineIntegration } from '@sentry/core';
import { configureClientErrors } from 'solid-js';

const INTEGRATION_NAME = 'SolidErrors';

/**
 * Reports every error a Solid `<Errored>` boundary catches — the runtime's
 * client error hook, available in every build tier. Uncaught errors keep
 * reaching the browser SDK's global handlers; this covers the ones a
 * fallback swallowed.
 */
export const solidErrorsIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      configureClientErrors({
        onError(error, { ownerPath, boundaryPath }) {
          captureException(error, {
            mechanism: { type: 'auto.function.solid.error_boundary', handled: true },
            captureContext: {
              tags: {
                'solid.owner': ownerPath?.join(' › '),
                'solid.boundary': boundaryPath?.join(' › '),
              },
              extra: { 'solid.ownerPath': ownerPath, 'solid.boundaryPath': boundaryPath },
            },
          });
        },
      });
    },
  };
});
