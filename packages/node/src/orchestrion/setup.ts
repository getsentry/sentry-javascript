import { debug } from '@sentry/core';
import type { SetupOrchestrionOptions } from '@sentry/server-utils/orchestrion';
import { setupOrchestrion } from '@sentry/server-utils/orchestrion';
import type { NodeClient } from '@sentry/node-core';
import { DEBUG_BUILD } from '../debug-build';

export type ExperimentalSetupOrchestrionOptions = SetupOrchestrionOptions;

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
 * This is the ONLY exported entry into the orchestrion code path. Bundlers can
 * statically determine that apps which never import this drop the entire
 * `orchestrion/` subtree from their output — that is the tree-shaking guarantee.
 *
 * The actual implementation lives in `@sentry/server-utils`; this Node
 * wrapper only adds the experimental opt-in check tied to `NodeOptions`.
 */
export function _experimentalSetupOrchestrion(
  client: NodeClient | undefined,
  options: ExperimentalSetupOrchestrionOptions = {},
): void {
  // Node-specific: verify the user remembered to set the experimental flag on
  // init(), which is what makes `init()` skip the OTel integrations these
  // channel-based ones replace. Without it, both systems instrument the same
  // library and produce duplicate spans.
  if (client && !(client.getOptions() as { _experimentalUseOrchestrion?: boolean })._experimentalUseOrchestrion) {
    DEBUG_BUILD &&
      debug.warn(
        '[Sentry] _experimentalSetupOrchestrion() called but Sentry.init() was not given ' +
          '`_experimentalUseOrchestrion: true` — it will use default instrumentation instead of ' +
          'channel-based instrumentation. Add the flag to Sentry.init().',
      );
  }

  setupOrchestrion(client, options);
}
