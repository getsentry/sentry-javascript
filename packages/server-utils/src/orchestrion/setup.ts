import type { Client, Integration } from '@sentry/core';
import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { mysqlChannelIntegration } from '../integrations/tracing-channel/mysql';
import { detectOrchestrionSetup } from './detect';

export interface SetupOrchestrionOptions {
  /**
   * Override the default set of channel-based integrations.
   * If omitted, all orchestrion integrations shipped by server-utils are added.
   */
  integrations?: Integration[];
}

/**
 * Wires up orchestrion-driven channel integrations on the given client.
 *
 * Must be called after the SDK's `init()`, with the client returned by it:
 *
 * ```ts
 * const client = Sentry.init({ dsn: '…' });
 * setupOrchestrion(client);
 * ```
 *
 * This is the only exported entry into `orchestrion/*` that registers
 * integrations. Bundlers can statically determine that apps which never import
 * it drop the entire `orchestrion/` subtree from their output — that is the
 * tree-shaking guarantee.
 *
 * The orchestrion runtime hook (`--import .../orchestrion/import-hook`) or the
 * bundler plugin (`sentryOrchestrionPlugin()`) must be active for the
 * channel-based integrations to record spans; `detectOrchestrionSetup()` warns
 * if neither ran.
 */
export function setupOrchestrion(client: Client | undefined, options: SetupOrchestrionOptions = {}): void {
  DEBUG_BUILD && debug.log('[orchestrion] setupOrchestrion() called');

  if (!client) {
    DEBUG_BUILD &&
      debug.warn('[Sentry] setupOrchestrion() was called without a client. Pass the value returned by `init()`.');
    return;
  }

  detectOrchestrionSetup();

  const integrations = options.integrations ?? [mysqlChannelIntegration()];
  DEBUG_BUILD &&
    debug.log(
      '[orchestrion] registering channel integrations:',
      integrations.map(i => i.name),
    );
  for (const integration of integrations) {
    client.addIntegration(integration);
  }
}
