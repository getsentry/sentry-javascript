import type { Integration } from '@sentry/core';
import { debug } from '@sentry/core';
import type { NodeClient } from '@sentry/node-core';
import { DEBUG_BUILD } from '../debug-build';
import { mysqlChannelIntegration } from '../integrations/tracing-channel/mysql';
import { detectOrchestrionSetup } from './detect';

export interface ExperimentalSetupOrchestrionOptions {
  /**
   * Override the default set of channel-based integrations.
   * If omitted, all orchestrion integrations shipped by @sentry/node are added.
   */
  integrations?: Integration[];
}

/**
 * EXPERIMENTAL — wires up orchestrion-driven channel integrations.
 *
 * Must be called after `Sentry.init({ _experimentalUseOrchestrion: true })`, with
 * the client returned by `init()`:
 *
 * ```ts
 * const client = Sentry.init({ dsn: '…', _experimentalUseOrchestrion: true });
 * _experimentalSetupOrchestrion(client);
 * ```
 *
 * This is the ONLY exported entry into `packages/node/src/orchestrion/*`. Bundlers
 * can statically determine that apps which never import this drop the entire
 * `orchestrion/` subtree from their output — that is the tree-shaking guarantee.
 */
export function _experimentalSetupOrchestrion(
  client: NodeClient | undefined,
  options: ExperimentalSetupOrchestrionOptions = {},
): void {
  DEBUG_BUILD && debug.log('[orchestrion] _experimentalSetupOrchestrion() called');

  if (!client) {
    DEBUG_BUILD &&
      debug.warn(
        '[Sentry] _experimentalSetupOrchestrion() was called without a client. ' +
          'Pass the value returned by `Sentry.init()`.',
      );
    return;
  }

  // Verify the user remembered to set the flag on init() — without it, the default
  // OTel integrations are still active and we'd produce duplicate spans.
  const clientOptions = client.getOptions() as { _experimentalUseOrchestrion?: boolean };
  if (!clientOptions._experimentalUseOrchestrion) {
    DEBUG_BUILD &&
      debug.warn(
        '[Sentry] _experimentalSetupOrchestrion() called but Sentry.init() was not given ' +
          '`_experimentalUseOrchestrion: true`. The default OTel integrations are still active — ' +
          'you will get duplicate spans. Add the flag to Sentry.init().',
      );
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
