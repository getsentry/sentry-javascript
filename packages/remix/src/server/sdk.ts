import type { Integration } from '@sentry/core';
import { applySdkMetadata, debug } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, init as nodeInit, isInitialized } from '@sentry/node';
import { DEBUG_BUILD } from '../utils/debug-build';
import type { RemixOptions } from '../utils/remixOptions';
import { instrumentServer } from './instrumentServer';
import { httpIntegration } from './integrations/http';
import { remixIntegration } from './integrations/opentelemetry';

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

  if (isInitialized()) {
    DEBUG_BUILD && debug.log('SDK already initialized');

    return;
  }

  options.defaultIntegrations = getRemixDefaultIntegrations(options as NodeOptions);

  const client = nodeInit(options as NodeOptions);

  instrumentServer();

  return client;
}
