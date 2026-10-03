import type { Integration } from '@sentry/core';
import { _INTERNAL_getActiveClient, applySdkMetadata, debug } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, init as nodeInit } from '@sentry/node';
import { DEBUG_BUILD } from '../utils/debug-build';
import type { RemixOptions } from '../utils/remixOptions';
import { instrumentServer } from './instrumentServer';
import { httpIntegration } from './integrations/http';
import { remixIntegration } from './integrations/RemixIntegration';

/**
 * Returns the default Remix integrations.
 *
 * @param options The options for the SDK.
 */
export function getRemixDefaultIntegrations(options: RemixOptions): Integration[] {
  return [
    ...getDefaultNodeIntegrations(options as NodeOptions).filter(integration => integration.name !== 'Http'),
    httpIntegration(),
    remixIntegration(),
  ].filter(int => int);
}

/** Initializes Sentry Remix SDK on Node. */
export function init(options: RemixOptions): NodeClient | undefined {
  applySdkMetadata(options, 'remix', ['remix', 'node']);

  const existingClient = _INTERNAL_getActiveClient<NodeClient>();
  if (existingClient) {
    DEBUG_BUILD && debug.log('SDK already initialized');

    return existingClient;
  }

  options.defaultIntegrations = getRemixDefaultIntegrations(options);

  const client = nodeInit(options);

  instrumentServer();

  return client;
}
