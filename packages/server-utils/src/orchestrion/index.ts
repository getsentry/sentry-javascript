import { lruMemoizerChannelIntegration } from '../integrations/tracing-channel/lru-memoizer';
import { mysqlChannelIntegration } from '../integrations/tracing-channel/mysql';
import { postgresChannelIntegration } from '../integrations/tracing-channel/postgres';

export { detectOrchestrionSetup, isOrchestrionInjected } from './detect';
export { lruMemoizerChannelIntegration, mysqlChannelIntegration, postgresChannelIntegration };

/**
 * The canonical set of orchestrion diagnostics-channel integrations, keyed by their public
 * (OTel-parity) factory name.
 *
 * Single source of truth: add a new channel integration here and every consumer — the `@sentry/node`
 * opt-in helper (`experimentalUseDiagnosticsChannelInjection`) and its public
 * `diagnosticsChannelInjectionIntegrations()` map — picks it up automatically, so there's no separate
 * list to keep in sync.
 */
export const channelIntegrations = {
  postgresIntegration: postgresChannelIntegration,
  mysqlIntegration: mysqlChannelIntegration,
  lruMemoizerIntegration: lruMemoizerChannelIntegration,
} as const;
