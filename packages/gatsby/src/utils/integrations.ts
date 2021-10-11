import * as Tracing from '@sentry/tracing';
import { Integration } from '@sentry/types';

import { GatsbyOptions } from './types';

/**
 * Returns the integrations to add to the SDK.
 * If tracing is enabled, `BrowserTracing` is always present.
 *
 * @param options The options users have defined.
 */
export function getIntegrationsFromOptions(options: GatsbyOptions): Integration[] {
  const integrations = [...(options.integrations || [])];
  if (
    Tracing.hasTracingEnabled(options) &&
    !integrations.some(integration => integration.name === Tracing.Integrations.BrowserTracing.name)
  ) {
    integrations.push(new Tracing.Integrations.BrowserTracing());
  }
  return integrations;
}
