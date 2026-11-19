import type { Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getNodeDefaultIntegrations, init as initNodeSdk } from '@sentry/node';
import { solidServerErrorsIntegration } from './errors';

/**
 * Initializes the server side of the Solid SDK for Solid 2.
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'solid', ['solid', 'node']);

  return initNodeSdk(opts);
}

export function getDefaultIntegrations(options: NodeOptions): Integration[] {
  return [...getNodeDefaultIntegrations(options), solidServerErrorsIntegration()];
}
