import type { BrowserOptions } from '@sentry/react';
import { getInjectedManagedTunnelOptions } from '../common/managedTunnelRoute';

/**
 * Applies the `tunnel` option to the Next.js SDK options based on `withSentryConfig`'s `tunnelRoute` option.
 */
export function applyTunnelRouteOption(options: BrowserOptions): void {
  const tunnelOptions = options.tunnel === undefined && getInjectedManagedTunnelOptions();
  if (tunnelOptions) {
    options.tunnel = tunnelOptions;
  }
}
