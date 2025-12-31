import type { Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, init as nodeInit } from '@sentry/node';

/**
 * Initializes the Nitro SDK
 */
export function init(options: NodeOptions | undefined = {}): NodeClient | undefined {
  const opts: NodeOptions = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'nitro');

  const client = nodeInit(opts);

  return client;
}

/**
 *  Get the default integrations for the Nitro SDK.
 *
 *  @returns The default integrations for the Nitro SDK.
 */
export function getDefaultIntegrations(options: NodeOptions): Integration[] | undefined {
  return [...getDefaultNodeIntegrations(options)];
}
