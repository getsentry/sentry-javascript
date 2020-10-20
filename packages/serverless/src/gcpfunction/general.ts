// '@google-cloud/functions-framework/build/src/functions' import is expected to be type-only so it's erased in the final .js file.
// When TypeScript compiler is upgraded, use `import type` syntax to explicitly assert that we don't want to load a module here.
import { Context } from '@google-cloud/functions-framework/build/src/functions';
import { Scope } from '@sentry/node';
import { Context as SentryContext } from '@sentry/types';
import * as domain from 'domain';
import { hostname } from 'os';

export interface WrapperOptions {
  flushTimeout: number;
}

/**
 * Enhances the scope with additional event information.
 *
 * @param scope scope
 * @param context event context
 */
export function configureScopeWithContext(scope: Scope, context: Context): void {
  scope.setContext('runtime', {
    name: 'node',
    version: global.process.version,
  });
  scope.setTag('server_name', process.env.SENTRY_NAME || hostname());
  scope.setContext('gcp.function.context', { ...context } as SentryContext);
}

/**
 * @returns Current active domain with a correct type.
 */
export function getActiveDomain(): domain.Domain {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  return (domain as any).active as domain.Domain;
}
