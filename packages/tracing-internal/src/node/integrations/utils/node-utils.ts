import type { Hub } from '@sentry/types';

/**
 * Check if Sentry auto-instrumentation should be disabled.
 *
 * @param getCurrentHub A method to fetch the current hub
 * @returns boolean
 */
export function shouldDisableAutoInstrumentation(getCurrentHub: () => Hub): boolean {
  // eslint-disable-next-line deprecation/deprecation
  const clientOptions = getCurrentHub().getClient()?.getOptions();
  const instrumenter = clientOptions?.instrumenter || 'sentry';

  return instrumenter !== 'sentry';
}
