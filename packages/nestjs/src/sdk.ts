import type { Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, init as nodeInit } from '@sentry/node';
import { registerOrchestrionInstrumentation } from '@sentry/server-utils/orchestrion';
import { nestIntegration } from './integrations/nest';
import { nestjsOrchestrion } from './orchestrion';

/**
 * Initializes the NestJS SDK
 */
export function init(options: NodeOptions | undefined = {}): NodeClient | undefined {
  // Inject the NestJS orchestrion instrumentation into the shared diagnostics-channel
  // assembly BEFORE `nodeInit()` runs — that's where the opt-in helper builds its
  // channel-integration list and the runtime hook registers the transform config.
  // A no-op unless the user opted into diagnostics-channel injection. On the
  // `--import` preload path, `@sentry/nestjs/import` registers it even earlier.
  registerOrchestrionInstrumentation(nestjsOrchestrion);

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
