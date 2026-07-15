import { amqplibChannelIntegration } from '../integrations/tracing-channel/amqplib';
import { anthropicChannelIntegration } from '../integrations/tracing-channel/anthropic';
import { genericPoolChannelIntegration } from '../integrations/tracing-channel/generic-pool';
import { googleGenAIChannelIntegration } from '../integrations/tracing-channel/google-genai';
import {
  graphqlChannelIntegration,
  graphqlDiagnosticsChannelIntegration,
} from '../integrations/tracing-channel/graphql';
import { hapiChannelIntegration } from '../integrations/tracing-channel/hapi';
import { ioredisChannelIntegration } from '../integrations/tracing-channel/ioredis';
import { kafkajsChannelIntegration } from '../integrations/tracing-channel/kafkajs';
import { lruMemoizerChannelIntegration } from '../integrations/tracing-channel/lru-memoizer';
import { mysqlChannelIntegration } from '../integrations/tracing-channel/mysql';
import { openaiChannelIntegration } from '../integrations/tracing-channel/openai';
import { postgresChannelIntegration } from '../integrations/tracing-channel/postgres';
import { postgresJsChannelIntegration } from '../integrations/tracing-channel/postgres-js';
import { vercelAiChannelIntegration } from '../integrations/tracing-channel/vercel-ai';
import { expressChannelIntegration } from '../integrations/tracing-channel/express';
import { CHANNEL_INTEGRATION_DEFINITIONS } from './channel-integration-definitions';

export { detectOrchestrionSetup, getRegisteredChannelIntegrations, isOrchestrionInjected } from './detect';
// The `@nestjs/*` channel names live here alongside their transform config; the
// listener that subscribes to them lives in `@sentry/nestjs`, which imports this.
export { nestjsChannels } from './config/nestjs';
export {
  amqplibChannelIntegration,
  anthropicChannelIntegration,
  genericPoolChannelIntegration,
  googleGenAIChannelIntegration,
  graphqlChannelIntegration,
  graphqlDiagnosticsChannelIntegration,
  hapiChannelIntegration,
  ioredisChannelIntegration,
  kafkajsChannelIntegration,
  lruMemoizerChannelIntegration,
  mysqlChannelIntegration,
  openaiChannelIntegration,
  postgresChannelIntegration,
  postgresJsChannelIntegration,
  vercelAiChannelIntegration,
  expressChannelIntegration,
};
export type { IORedisChannelIntegrationOptions, IORedisResponseHook } from '../integrations/tracing-channel/ioredis';
export type { PostgresJsChannelIntegrationOptions } from '../integrations/tracing-channel/postgres-js';
export { redisChannelIntegration } from '../integrations/tracing-channel/redis';
export type { RedisChannelIntegrationOptions, RedisResponseHook } from '../integrations/tracing-channel/redis';

// The structural `graphql` package types are the single source of truth shared with `@sentry/node`'s
// vendored OTel graphql instrumentation (re-exported from here so the two can't drift).
export type * from '../integrations/tracing-channel/graphql/graphql-types';

/**
 * The canonical set of orchestrion diagnostics-channel integrations, keyed by their public
 * (OTel-parity) factory name.
 *
 * Single source of truth: add a new channel integration here and every consumer — the `@sentry/node`
 * opt-in helper (`experimentalUseDiagnosticsChannelInjection`), its public
 * `diagnosticsChannelInjectionIntegrations()` map, and the marker-based `registerChannelIntegrations()`
 * below — picks it up automatically. The only companion data to maintain is
 * {@link CHANNEL_INTEGRATION_DEFINITIONS}, and its `Record` guard errors at compile time when an
 * entry here has no definition there.
 *
 * NOTE: `ioredisChannelIntegration` and `redisChannelIntegration` are intentionally NOT here. They
 * only partially replace the composite OTel `Redis` integration and need the node SDK's redis cache
 * `responseHook` (which can't live in `server-utils`), so `@sentry/node` wires them up separately.
 *
 * Framework SDKs that own their own channel listener (e.g. `@sentry/nestjs`'s `Nest`) are NOT here
 * either: their transform config is still in `SENTRY_INSTRUMENTATIONS`, but the listener lives in
 * their package and picks the channel-vs-OTel path itself at `setupOnce`, so it needs no central swap.
 */
export const channelIntegrations = {
  postgresIntegration: postgresChannelIntegration,
  postgresJsIntegration: postgresJsChannelIntegration,
  mysqlIntegration: mysqlChannelIntegration,
  genericPoolIntegration: genericPoolChannelIntegration,
  lruMemoizerIntegration: lruMemoizerChannelIntegration,
  openaiIntegration: openaiChannelIntegration,
  anthropicIntegration: anthropicChannelIntegration,
  googleGenAIIntegration: googleGenAIChannelIntegration,
  vercelAiIntegration: vercelAiChannelIntegration,
  amqplibIntegration: amqplibChannelIntegration,
  hapiIntegration: hapiChannelIntegration,
  expressIntegration: expressChannelIntegration,
  graphqlIntegration: graphqlDiagnosticsChannelIntegration,
  kafkajsIntegration: kafkajsChannelIntegration,
} as const;

/**
 * Compile-time guard that {@link CHANNEL_INTEGRATION_DEFINITIONS} — the factory-free metadata the
 * Vite plugin and this registry both read — stays in lockstep with {@link channelIntegrations}: a
 * missing or mistyped key here fails the build. The `modules` each integration subscribes to (used by
 * `getRegisteredChannelIntegrations()` to activate only integrations whose module was transformed
 * into the bundle) live in the definitions so there is a single source of truth.
 */
const _channelIntegrationDefinitionsGuard: Record<
  keyof typeof channelIntegrations,
  { exportName: string; modules: readonly string[] }
> = CHANNEL_INTEGRATION_DEFINITIONS;

/**
 * Puts the factories of all channel integrations — each paired with the package
 * name(s) it instruments — onto the global orchestrion marker, where
 * `getRegisteredChannelIntegrations()` picks them up. It uses the paired module
 * names to activate only integrations whose module the bundler actually
 * transformed (via the marker's `transformedModules` list).
 *
 * Only meant to be called from the registration import that a bundler plugin
 * injects into the app entry (e.g. the one the `@sentry/cloudflare/vite` plugin
 * injects into the worker bundle) — calling it statically from an SDK would
 * defeat the whole point of the registry, which is keeping the integration code
 * out of bundles that the injecting plugin never touched.
 */
export function registerChannelIntegrations(): void {
  const marker = (globalThis.__SENTRY_ORCHESTRION__ = globalThis.__SENTRY_ORCHESTRION__ || {});
  marker.integrations = (Object.keys(channelIntegrations) as Array<keyof typeof channelIntegrations>).map(key => ({
    factory: channelIntegrations[key],
    modules: [...CHANNEL_INTEGRATION_DEFINITIONS[key].modules],
  }));
}
