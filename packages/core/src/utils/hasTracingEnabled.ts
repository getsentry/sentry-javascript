import { getClient } from '../currentScopes';
import type { Options } from '../types-hoist';

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean | undefined;

/**
 * Determines if tracing is currently enabled.
 *
 * Tracing is enabled when at least one of `tracesSampleRate` and `tracesSampler` is defined in the SDK config.
 */
export function hasTracingEnabled(
  maybeOptions?: Pick<Options, 'tracesSampleRate' | 'tracesSampler' | 'enableTracing'> | undefined,
): boolean {
  if (typeof __SENTRY_TRACING__ === 'boolean' && !__SENTRY_TRACING__) {
    return false;
  }

  const client = getClient();
  const options = maybeOptions || (client && client.getOptions());
  // eslint-disable-next-line deprecation/deprecation
  return !!options && (options.enableTracing || 'tracesSampleRate' in options || 'tracesSampler' in options);
}
