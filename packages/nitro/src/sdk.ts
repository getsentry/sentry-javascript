import type { Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, init as nodeInit, nitroIntegration } from '@sentry/node';

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
  // `nitroIntegration` is also part of the Node tracing integrations, but add it explicitly so it is
  // always present for the Nitro SDK regardless of that gating (deduped by name when both are added).
  return [...getDefaultNodeIntegrations(options), nitroIntegration()];
}
