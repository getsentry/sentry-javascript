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
import { tediousChannelIntegration } from '../integrations/tracing-channel/tedious';
import { vercelAiChannelIntegration } from '../integrations/tracing-channel/vercel-ai';
import { expressChannelIntegration } from '../integrations/tracing-channel/express';

export { detectOrchestrionSetup, isOrchestrionInjected } from './detect';
// The `@nestjs/*` channel names live here alongside their transform config; the
// listener that subscribes to them lives in `@sentry/nestjs`, which imports this.
export { nestjsChannels } from './config/nestjs';
export {
  amqplibChannelIntegration,
  anthropicChannelIntegration,
  genericPoolChannelIntegration,
  googleGenAIChannelIntegration,
  graphqlChannelIntegration,
  hapiChannelIntegration,
  ioredisChannelIntegration,
  kafkajsChannelIntegration,
  lruMemoizerChannelIntegration,
  mysqlChannelIntegration,
  openaiChannelIntegration,
  postgresChannelIntegration,
  postgresJsChannelIntegration,
  tediousChannelIntegration,
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
 * opt-in helper (`experimentalUseDiagnosticsChannelInjection`) and its public
 * `diagnosticsChannelInjectionIntegrations()` map — picks it up automatically, so there's no separate
 * list to keep in sync.
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
  tediousIntegration: tediousChannelIntegration,
} as const;
