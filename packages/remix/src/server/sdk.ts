import type { Integration } from '@sentry/core';
import { applySdkMetadata, logger } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import {
  getDefaultIntegrations as getDefaultNodeIntegrations,
  initWithoutDefaultIntegrations,
  isInitialized,
} from '@sentry/node';
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
  ].filter(int => int) as Integration[];
}

/** Initializes Sentry Remix SDK on Node. */
export function init(options: RemixOptions): NodeClient | undefined {
  if (isInitialized()) {
    DEBUG_BUILD && logger.log('SDK already initialized');

    return;
  }

  const opts = {
    ...options,
  };
  applySdkMetadata(opts, 'remix', ['remix', 'node']);

  const client = initWithoutDefaultIntegrations(opts, getRemixDefaultIntegrations);

  instrumentServer();

  return client;
}
