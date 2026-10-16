import { captureException, defineIntegration } from '@sentry/core';
import type { ServerErrorContext } from '@solidjs/web';
import { configureServerErrors } from '@solidjs/web';

const INTEGRATION_NAME = 'SolidServerErrors';

export interface SolidServerErrorsOptions {
  /**
   * Map an error to what the client receives in its place — rendered into
   * the fallback, serialized for hydration, sent as the RPC error. Return
   * nothing for Solid's default wire policy (a generic error outside the dev
   * build). Solid does not sanitize a returned value again.
   */
  mapError?: (error: unknown, context: ServerErrorContext) => unknown | void;
}

/**
 * Reports every failure Solid's server runtime handles or fails on, once per
 * error object, with where it was met: an `<Errored>` fallback rendered, a
 * `<Loading>` fragment rejected, a server-function throw (HTTP dispatch or an
 * in-process call during SSR), a hydration value that would not serialize,
 * the failure that fails a request. The error as thrown — the wire gets the
 * sanitized one. Available in every build tier.
 */
export const solidServerErrorsIntegration = defineIntegration((options: SolidServerErrorsOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      configureServerErrors({
        onError(error, context) {
          const { kind, handling, boundary, boundaryPath, functionId, direct, ownerPath } = context;
          captureException(error, {
            mechanism: {
              type: `auto.function.solid.server.${kind}.${handling}`,
              handled: handling !== 'failed',
            },
            captureContext: {
              tags: {
                'solid.kind': kind,
                'solid.handling': handling,
                'solid.boundary': boundary,
                'solid.function': functionId,
                'solid.direct': direct === undefined ? undefined : String(direct),
                'solid.owner': ownerPath?.join(' › '),
                'solid.boundary_path': boundaryPath?.join(' › '),
              },
              extra: { 'solid.ownerPath': ownerPath, 'solid.boundaryPath': boundaryPath },
            },
          });
          return options.mapError?.(error, context);
        },
      });
    },
  };
});
