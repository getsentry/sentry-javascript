import { isWrapped } from '@opentelemetry/instrumentation';
import { consoleSandbox, getClient, getGlobalScope, hasSpansEnabled, isEnabled } from '@sentry/core';
import type { NodeClient } from '../sdk/client';
import { createMissingInstrumentationContext } from './createMissingInstrumentationContext';
import { isCjs } from './detection';

/**
 * Checks and warns if a framework isn't wrapped by opentelemetry.
 */
export function ensureIsWrapped(
  maybeWrappedFunction: unknown,
  name: 'express' | 'connect' | 'fastify' | 'hapi' | 'koa' | 'hono',
): void {
  const clientOptions = getClient<NodeClient>()?.getOptions();
  if (
    !clientOptions?.disableInstrumentationWarnings &&
    !isWrapped(maybeWrappedFunction) &&
    isEnabled() &&
    hasSpansEnabled(clientOptions)
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
