import { applySdkMetadata, type Integration } from '@sentry/core';
import {
  getDefaultIntegrations as getNodeDefaultIntegrations,
  init as nodeInit,
  type NodeClient,
  type NodeOptions,
} from '@sentry/node';

import { remixV3Integration } from './integration';

/** Default integrations for the Remix 3 server SDK. */
export function getDefaultIntegrations(options: NodeOptions): Integration[] {
  return [...getNodeDefaultIntegrations(options), remixV3Integration()];
}

/**
 * Initialize the Sentry Remix 3 SDK on the server.
 *
 * Start the app with `--import @sentry/remix/v3/node` so the module hook is registered before
 * `@remix-run/fetch-router` is imported. Remix 3 has no build step, so no bundler plugin can apply the
 * transform, and imports are hoisted above any `init()` call in the server entry.
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts = {
    ...options,
    defaultIntegrations: options.defaultIntegrations ?? getDefaultIntegrations(options),
  };

  applySdkMetadata(opts, 'remix', ['remix', 'node']);

  return nodeInit(opts);
}
