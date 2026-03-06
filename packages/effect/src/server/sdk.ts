import type { Client } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { NodeOptions } from '@sentry/node-core/light';
import { init as initNode } from '@sentry/node-core/light';

/**
 * Initializes the Sentry Effect SDK for Node.js servers.
 *
 * @param options - Configuration options for the SDK
 * @returns The initialized Sentry client, or undefined if initialization failed
 */
export function init(options: NodeOptions): Client | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'effect', ['effect', 'node-light']);

  return initNode(opts);
}
