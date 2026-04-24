import type { Client } from '@sentry/core';
import { applySdkMetadata, debug, getClient } from '@sentry/core';
import { init as initNode } from '@sentry/node';
import type { HonoNodeOptions } from './middleware';
import { buildFilteredIntegrations } from '../shared/buildFilteredIntegrations';

/**
 * Initializes Sentry for Hono running in a Node runtime environment.
 *
 * This function should be called in an `instrument.ts` file loaded via `--import` to set up Sentry globally for the application.
 */
export function init(options: HonoNodeOptions): Client | undefined {
  const existingClient = getClient();
  if (existingClient) {
    debug.log('Sentry is already initialized, skipping re-initialization.');
    return existingClient;
  }

  applySdkMetadata(options, 'hono', ['hono', 'node']);

  const filteredOptions: HonoNodeOptions = {
    ...options,
    integrations: buildFilteredIntegrations(options.integrations, false),
  };

  return initNode(filteredOptions);
}
