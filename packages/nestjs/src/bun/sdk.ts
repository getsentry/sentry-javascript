import type { BunOptions } from '@sentry/bun';
import { getDefaultIntegrations as getDefaultBunIntegrations, init as bunInit } from '@sentry/bun';
import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { nestIntegration } from '../integrations/nest';

/**
 * Initializes the NestJS SDK on Bun.
 */
export function init(options: BunOptions = {}): Client | undefined {
  const opts: BunOptions = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'nestjs', ['nestjs', 'bun']);

  return bunInit(opts);
}

/** Get the default integrations for the NestJS SDK on Bun. */
export function getDefaultIntegrations(options: BunOptions): Integration[] {
  return [nestIntegration(), ...getDefaultBunIntegrations(options)];
}
