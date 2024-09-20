import { isWrapped } from '@opentelemetry/core';
import { getClient, getGlobalScope, hasTracingEnabled, isEnabled } from '@sentry/core';
import { consoleSandbox } from '@sentry/utils';
import type { NodeClient } from '../sdk/client';
import { isCjs } from './commonjs';
import { createMissingInstrumentationContext } from './createMissingInstrumentationContext';

/**
 * Checks and warns if a framework isn't wrapped by opentelemetry.
 */
export function ensureIsWrapped(
  maybeWrappedFunction: unknown,
  name: 'express' | 'connect' | 'fastify' | 'hapi' | 'koa',
): void {
  const client = getClient<NodeClient>();
  if (
    !client?.getOptions().disableInstrumentationWarnings &&
    !isWrapped(maybeWrappedFunction) &&
    isEnabled() &&
    hasTracingEnabled()
  ) {
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
