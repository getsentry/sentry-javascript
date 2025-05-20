import type { Integration } from '@sentry/core';
import { applySdkMetadata, rewriteFramesIntegration } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, initWithDefaultIntegrations } from '@sentry/node';

/**
 * Initialize the Server-side Sentry SDK
 * @param options
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'sveltekit', ['sveltekit', 'node']);

  return initWithDefaultIntegrations(opts, getDefaultIntegrations);
}

function getDefaultIntegrations(options: NodeOptions): Integration[] {
  return [...getDefaultNodeIntegrations(options), rewriteFramesIntegration()];
}
