import type { Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, init as nodeInit } from '@sentry/node';
import { nestIntegration } from './integrations/nest';

/**
 * Initializes the NestJS SDK
 */
export function init(options: NodeOptions | undefined = {}): NodeClient | undefined {
  const opts: NodeOptions = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'nestjs', ['nestjs', 'node']);

  return nodeInit(opts);
}

/** Get the default integrations for the NestJS SDK. */
export function getDefaultIntegrations(options: NodeOptions): Integration[] | undefined {
  return [nestIntegration(), ...getDefaultNodeIntegrations(options)];
}
