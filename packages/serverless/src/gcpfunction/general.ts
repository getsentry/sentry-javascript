// '@google-cloud/functions-framework/build/src/functions' import is expected to be type-only so it's erased in the final .js file.
// When TypeScript compiler is upgraded, use `import type` syntax to explicitly assert that we don't want to load a module here.
import { Context } from '@google-cloud/functions-framework/build/src/functions';
import { captureException, Scope, SDK_VERSION, withScope } from '@sentry/node';
import { Context as SentryContext } from '@sentry/types';
import { addExceptionMechanism } from '@sentry/utils';
import * as domain from 'domain';
import { hostname } from 'os';

export interface WrapperOptions {
  flushTimeout: number;
}

/**
 * Capture exception with additional event information.
 *
 * @param e exception to be captured
 * @param context event context
 */
export function captureEventError(e: unknown, context: Context): void {
  withScope(scope => {
    addServerlessEventProcessor(scope);
    scope.setContext('runtime', {
      name: 'node',
      version: global.process.version,
    });
    scope.setTag('server_name', process.env.SENTRY_NAME || hostname());
    scope.setContext('gcp.function.context', { ...context } as SentryContext);
    captureException(e);
  });
}

/**
 * Add event processor that will override SDK details to point to the serverless SDK instead of Node,
 * as well as set correct mechanism type, which should be set to `handled: false`.
 * We do it like this, so that we don't introduce any side-effects in this module, which makes it tree-shakeable.
 * @param scope Scope that processor should be added to
 */
export function addServerlessEventProcessor(scope: Scope): void {
  scope.addEventProcessor(event => {
    event.sdk = {
      ...event.sdk,
      name: 'sentry.javascript.serverless',
      integrations: [...((event.sdk && event.sdk.integrations) || []), 'GCPFunction'],
      packages: [
        ...((event.sdk && event.sdk.packages) || []),
        {
          name: 'npm:@sentry/serverless',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    addExceptionMechanism(event, {
      handled: false,
    });

    return event;
  });
}

/**
 * @returns Current active domain with a correct type.
 */
export function getActiveDomain(): domain.Domain {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  return (domain as any).active as domain.Domain;
}
