import type { Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, httpIntegration, init as nodeInit } from '@sentry/node';
import { isNitroDevServer } from './devServer';

/**
 * Initializes the Nitro SDK
 */
export function init(options: NodeOptions | undefined = {}): NodeClient | undefined {
  const opts: NodeOptions = {
    ...options,
  };

  if (opts.defaultIntegrations === undefined) {
    opts.defaultIntegrations = getDefaultIntegrations(opts);
  }

  applySdkMetadata(opts, 'nitro', ['nitro', 'node']);

  const client = nodeInit(opts);

  return client;
}

/**
 *  Get the default integrations for the Nitro SDK.
 *
 *  @returns The default integrations for the Nitro SDK.
 */
export function getDefaultIntegrations(options: NodeOptions): Integration[] | undefined {
  return [
    ...getDefaultNodeIntegrations(options).filter(integration => integration.name !== 'Http'),
    // Nitro's worker creates the request's `http.server` span, so the dev server in front of it doesn't.
    httpIntegration({ ignoreIncomingRequests: isNitroDevServer }),
  ];
}
