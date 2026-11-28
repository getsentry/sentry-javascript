import type { Integration } from '@sentry/core';
import { _INTERNAL_captureOptionsSetByUser, applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, httpIntegration, init as nodeInit } from '@sentry/node';
import { isNitroDevServer } from './devServer';

/**
 * Options for the Nitro SDK's `init()`.
 */
export interface NitroOptions extends NodeOptions {
  /**
   * Enables the Sentry error handler for the Nitro error hook.
   *
   * When enabled, errors that Nitro handles are sent to Sentry with the request and Nitro error context.
   * Disable it only if you capture these errors yourself.
   *
   * @default true
   */
  enableNitroErrorHandler?: boolean;
}

/**
 * Initializes the Nitro SDK
 */
export function init(options: NitroOptions | undefined = {}): NodeClient | undefined {
  const opts: NitroOptions = {
    ..._INTERNAL_captureOptionsSetByUser(options),
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
