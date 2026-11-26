import type { Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import {
  addServerTimingTraceHeader,
  getDefaultIntegrations as getNodeDefaultIntegrations,
  init as initNodeSdk,
} from '@sentry/node';
import { solidServerErrorsIntegration } from './errors';
import { solidServerObserveIntegration } from './observe';
import { solidServerTracePropagationIntegration } from './tracePropagation';

/**
 * Initializes the server side of the Solid SDK for Solid 2.
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'solid', ['solid', 'node']);

  const client = initNodeSdk(opts);
  if (client) {
    // Sends the trace to the browser on every document response, so the pageload continues it.
    addServerTimingTraceHeader(client);
  }

  return client;
}

export function getDefaultIntegrations(options: NodeOptions): Integration[] {
  return [
    ...getNodeDefaultIntegrations(options),
    solidServerErrorsIntegration(),
    solidServerTracePropagationIntegration(),
    solidServerObserveIntegration(),
  ];
}
