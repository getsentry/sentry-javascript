import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { DenoOptions } from '@sentry/deno';
import { getDefaultIntegrations as getDefaultDenoIntegrations, init as denoInit } from '@sentry/deno';
import { nestIntegration } from '../integrations/nest';

/**
 * Initializes the NestJS SDK on Deno.
 */
export function init(options: DenoOptions = {}): Client {
  const opts: DenoOptions = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'nestjs', ['nestjs', 'deno']);

  return denoInit(opts);
}

/** Get the default integrations for the NestJS SDK on Deno. */
export function getDefaultIntegrations(options: DenoOptions): Integration[] {
  return [nestIntegration(), ...getDefaultDenoIntegrations(options)];
}
