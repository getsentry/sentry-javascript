import { anthropicChannelIntegration } from '../integrations/tracing-channel/anthropic';
import { ioredisChannelIntegration } from '../integrations/tracing-channel/ioredis';
import { lruMemoizerChannelIntegration } from '../integrations/tracing-channel/lru-memoizer';
import { mysqlChannelIntegration } from '../integrations/tracing-channel/mysql';
import { openaiChannelIntegration } from '../integrations/tracing-channel/openai';
import { postgresChannelIntegration } from '../integrations/tracing-channel/postgres';
import { vercelAiChannelIntegration } from '../integrations/tracing-channel/vercel-ai';

export { detectOrchestrionSetup, getRegisteredChannelIntegrations, isOrchestrionInjected } from './detect';
export {
  anthropicChannelIntegration,
  ioredisChannelIntegration,
  lruMemoizerChannelIntegration,
  mysqlChannelIntegration,
  openaiChannelIntegration,
  postgresChannelIntegration,
  vercelAiChannelIntegration,
};
export type { IORedisChannelIntegrationOptions, IORedisResponseHook } from '../integrations/tracing-channel/ioredis';

/**
 * The canonical set of orchestrion diagnostics-channel integrations, keyed by their public
 * (OTel-parity) factory name.
 *
 * Single source of truth: add a new channel integration here and every consumer — the `@sentry/node`
 * opt-in helper (`experimentalUseDiagnosticsChannelInjection`) and its public
 * `diagnosticsChannelInjectionIntegrations()` map — picks it up automatically, so there's no separate
 * list to keep in sync.
 *
 * NOTE: `ioredisChannelIntegration` is intentionally NOT here. It only partially replaces the
 * composite OTel `Redis` integration and needs the node SDK's redis cache `responseHook` (which
 * can't live in `server-utils`), so `@sentry/node` wires it up separately.
 */
export const channelIntegrations = {
  postgresIntegration: postgresChannelIntegration,
  mysqlIntegration: mysqlChannelIntegration,
  lruMemoizerIntegration: lruMemoizerChannelIntegration,
  openaiIntegration: openaiChannelIntegration,
  anthropicIntegration: anthropicChannelIntegration,
  vercelAiIntegration: vercelAiChannelIntegration,
} as const;

/**
 * Puts the factories of all channel integrations onto the global orchestrion
 * marker, where `getRegisteredChannelIntegrations()` picks them up.
 *
 * Only meant to be called from a bundler-injected registration module (e.g.
 * `@sentry/cloudflare/orchestrion`, injected by the `@sentry/cloudflare/vite`
 * plugin) — calling it statically from an SDK would defeat the whole point of
 * the registry, which is keeping the integration code out of bundles that the
 * injecting plugin never touched.
 */
export function registerChannelIntegrations(): void {
  const marker = (globalThis.__SENTRY_ORCHESTRION__ = globalThis.__SENTRY_ORCHESTRION__ || {});
  marker.integrations = Object.values(channelIntegrations);
}
