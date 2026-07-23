import type { Client } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import { init as initNode } from '@sentry/node';

/**
 * Initializes the Sentry Effect SDK for Node.js servers.
 *
 * @param options - Configuration options for the SDK
 * @returns The initialized Sentry client, or undefined if initialization failed
 */
export function init(options: NodeOptions): Client | undefined {
  const opts = {
    ...options,
    // The Effect SDK provides its own tracing (`SentryEffectTracer`), logging and error capture, so
    // node's auto-instrumentation default integrations should not additionally create spans.
    defaultIntegrations: options.defaultIntegrations ?? false,
  };

  applySdkMetadata(opts, 'effect', ['effect', 'node']);

  return initNode(opts);
}
