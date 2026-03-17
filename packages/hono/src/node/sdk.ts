import type { Client } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { init as initNode } from '@sentry/node';
import { HonoNodeOptions } from './middleware';

/**
 * Initializes Sentry for Hono running in a Node runtime environment.
 *
 * In general, it is recommended to initialize Sentry via the `sentry()` middleware, as it sets up everything by default and calls `init` internally.
 *
 * When manually calling `init`, add the `honoIntegration` to the `integrations` array to set up the Hono integration.
 */
export function init(options: HonoNodeOptions): Client | undefined {
  applySdkMetadata(options, 'hono', ['hono', 'node']);

  return initNode(options);
}
