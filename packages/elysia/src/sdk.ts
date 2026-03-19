import * as os from 'node:os';
import {
  bunServerIntegration,
  getDefaultIntegrations as getBunDefaultIntegrations,
  makeFetchTransport,
} from '@sentry/bun';
import type { Integration, Options } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { init as initNode, type NodeClient } from '@sentry/bun';
import type { ElysiaOptions } from './types';

/** Get the default integrations for the Elysia SDK. */
export function getDefaultIntegrations(_options: Options): Integration[] {
  // Filter out bunServerIntegration
  // Elysia already produces an HTTP server span, so we don't need Bun's competing root span.
  return getBunDefaultIntegrations(_options).filter(i => i.name !== bunServerIntegration().name);
}

/**
 * Get the runtime name and version.
 */
function getRuntime(): { name: string; version: string } {
  if (typeof Bun !== 'undefined') {
    return { name: 'bun', version: Bun.version };
  }

  return { name: 'node', version: process.version };
}

/**
 * Initializes the Sentry Elysia SDK.
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/elysia';
 *
 * Sentry.init({
 *   dsn: '__DSN__',
 *   tracesSampleRate: 1.0,
 * });
 * ```
 */
export function init(userOptions: ElysiaOptions = {}): NodeClient | undefined {
  const options = {
    ...userOptions,
    platform: 'javascript',
    runtime: getRuntime(),
    serverName: userOptions.serverName || global.process.env.SENTRY_NAME || os.hostname(),
  };

  applySdkMetadata(userOptions, 'elysia', ['elysia', options.runtime.name]);

  options.transport = options.transport || makeFetchTransport;

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  return initNode(options);
}
