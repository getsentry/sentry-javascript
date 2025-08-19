import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import {
  getDefaultIntegrations as getDefaultNodeIntegrations,
  httpIntegration,
  init as initNodeSdk,
} from '@sentry/node';
import { svelteKitSpansIntegration } from '../server-common/processKitSpans';
import { rewriteFramesIntegration } from '../server-common/rewriteFramesIntegration';
import { getKitTracingConfig } from '../server-common/utils';

/**
 * Initialize the Server-side Sentry SDK
 * @param options
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const defaultIntegrations = [...getDefaultNodeIntegrations(options), rewriteFramesIntegration()];

  const config = getKitTracingConfig();
  if (config.instrumentation) {
    // Whenever `instrumentation` is enabled, we don't need httpIntegration to emit spans
    // - if `tracing` is enabled, kit will emit the root span
    // - if `tracing` is disabled, our handler will emit the root span
    defaultIntegrations.push(httpIntegration({ disableIncomingRequestSpans: true }));
    if (config.tracing) {
      // If `tracing` is enabled, we need to instrument spans for the server
      defaultIntegrations.push(svelteKitSpansIntegration());
    }
  }

  const opts = {
    defaultIntegrations,
    ...options,
  };

  applySdkMetadata(opts, 'sveltekit', ['sveltekit', 'node']);

  return initNodeSdk(opts);
}
