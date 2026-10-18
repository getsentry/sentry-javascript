import type { Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getNodeDefaultIntegrations, init as initNodeSdk } from '@sentry/node';
import { solidServerErrorsIntegration } from './errors';

/** Initializes the server half of the Solid 2 SDK. */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'solid-2', ['solid-2', 'node']);

  return initNodeSdk(opts);
}

/**
 * The Node SDK's defaults plus Solid's server error hook: every failure the
 * server runtime handles reports in every build tier. Tracing
 * (`solidServerTracingIntegration`) is opt-in and needs the `observe` build.
 */
export function getDefaultIntegrations(options: NodeOptions): Integration[] {
  return [...getNodeDefaultIntegrations(options), solidServerErrorsIntegration()];
}
