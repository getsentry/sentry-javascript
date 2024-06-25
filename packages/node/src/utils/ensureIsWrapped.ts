import { isWrapped } from '@opentelemetry/core';
import { getGlobalScope, hasTracingEnabled, isEnabled } from '@sentry/core';
import { consoleSandbox } from '@sentry/utils';
import { createMissingInstrumentationContext } from '../integrations/context';
import { isCjs } from './commonjs';

/**
 * Checks and warns if a framework isn't wrapped by opentelemetry.
 */
export function ensureIsWrapped(
  maybeWrappedModule: unknown,
  name: 'express' | 'connect' | 'fastify' | 'hapi' | 'koa',
): void {
  if (!isWrapped(maybeWrappedModule) && isEnabled() && hasTracingEnabled()) {
    consoleSandbox(() => {
      if (isCjs()) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Sentry] ${name} is not instrumented. This is likely because you required/imported ${name} before calling \`Sentry.init()\`.`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[Sentry] ${name} is not instrumented. Please make sure to initialize Sentry in a separate file that you \`--import\` when running node, see: https://docs.sentry.io/platforms/javascript/guides/${name}/install/esm/.`,
        );
      }
    });

    getGlobalScope().setContext('missing_instrumentation', createMissingInstrumentationContext(name));
  }
}
