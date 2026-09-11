import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import { contextLinesIntegration, init as initNode, linkedErrorsIntegration } from '@sentry/node';

/**
 * Only the integrations needed to enrich captured errors with source context and `cause` chains.
 * Node's auto-instrumentation defaults are left out because `SentryEffectTracer` records Effect's own spans.
 */
export function getDefaultIntegrations(): Integration[] {
  return [contextLinesIntegration(), linkedErrorsIntegration()];
}

/**
 * Initializes the Sentry Effect SDK for Node.js servers.
 *
 * @param options - Configuration options for the SDK
 * @returns The initialized Sentry client, or undefined if initialization failed
 */
export function init(options: NodeOptions): Client | undefined {
  const opts = {
    ...options,
    defaultIntegrations: options.defaultIntegrations ?? getDefaultIntegrations(),
  };

  applySdkMetadata(opts, 'effect', ['effect', 'node']);

  return initNode(opts);
}
