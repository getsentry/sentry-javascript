import { amqplibIntegration } from '../integrations/tracing-channel/amqplib';
import { anthropicIntegration } from '../integrations/tracing-channel/anthropic';
import { awsIntegration } from '../integrations/tracing-channel/aws-sdk';
import { dataloaderIntegration } from '../integrations/tracing-channel/dataloader';
import { genericPoolIntegration } from '../integrations/tracing-channel/generic-pool';
import { googleGenAIIntegration } from '../integrations/tracing-channel/google-genai';
import { graphqlIntegration, graphqlDiagnosticsIntegration } from '../integrations/tracing-channel/graphql';
import { hapiIntegration } from '../integrations/tracing-channel/hapi';
import { koaIntegration } from '../integrations/tracing-channel/koa';
import { ioredisChannelIntegration } from '../integrations/tracing-channel/ioredis';
import { kafkajsIntegration } from '../integrations/tracing-channel/kafkajs';
import { knexIntegration } from '../integrations/tracing-channel/knex';
import { langChainIntegration } from '../integrations/tracing-channel/langchain';
import { langGraphIntegration } from '../integrations/tracing-channel/langgraph';
import { lruMemoizerIntegration } from '../integrations/tracing-channel/lru-memoizer';
import { mongodbIntegration } from '../integrations/tracing-channel/mongodb';
import { mongooseIntegration } from '../integrations/tracing-channel/mongoose';
import { mysqlIntegration } from '../integrations/tracing-channel/mysql';
import { mysql2Integration } from '../integrations/tracing-channel/mysql2';
import { openaiIntegration } from '../integrations/tracing-channel/openai';
import { postgresIntegration } from '../integrations/tracing-channel/postgres';
import { postgresJsIntegration } from '../integrations/tracing-channel/postgres-js';
import { tediousIntegration } from '../integrations/tracing-channel/tedious';
import { vercelAiIntegration } from '../integrations/tracing-channel/vercel-ai';
import { expressIntegration } from '../integrations/tracing-channel/express';
import { firebaseIntegration } from '../integrations/tracing-channel/firebase';

export { detectOrchestrionSetup, isOrchestrionInjected } from './detect';
// The runtime target of the subscribe-injection snippet: instrumented modules
// import this to self-register their channel subscriber on the global marker
// (used by bundler-only SDKs).
export { registerOrchestrionChannelIntegration } from './registerChannelIntegration';
// The `@nestjs/*` channel names live here alongside their transform config; the
// listener that subscribes to them lives in `@sentry/nestjs`, which imports this.
export { nestjsChannels } from './config/nestjs';
// The remix channel names live here alongside their transform config; the
// listener that subscribes to them lives in `@sentry/remix`, which imports this.
export { remixChannels } from './config/remix';
export {
  amqplibIntegration,
  anthropicIntegration,
  awsIntegration,
  dataloaderIntegration,
  genericPoolIntegration,
  googleGenAIIntegration,
  graphqlIntegration,
  graphqlDiagnosticsIntegration,
  hapiIntegration,
  koaIntegration,
  ioredisChannelIntegration,
  kafkajsIntegration,
  knexIntegration,
  langChainIntegration,
  langGraphIntegration,
  lruMemoizerIntegration,
  mongodbIntegration,
  mongooseIntegration,
  mysqlIntegration,
  mysql2Integration,
  openaiIntegration,
  postgresIntegration,
  postgresJsIntegration,
  tediousIntegration,
  vercelAiIntegration,
  expressIntegration,
  firebaseIntegration,
};
export type { KoaIntegrationOptions } from '../integrations/tracing-channel/koa';
export type { IORedisChannelIntegrationOptions, IORedisResponseHook } from '../integrations/tracing-channel/ioredis';
export type { PostgresJsIntegrationOptions } from '../integrations/tracing-channel/postgres-js';
export { redisChannelIntegration } from '../integrations/tracing-channel/redis';
export type { RedisChannelIntegrationOptions, RedisResponseHook } from '../integrations/tracing-channel/redis';
export type { InstrumentationConfig, CustomTransform } from './apmTypes';

// The structural `graphql` package types are the single source of truth shared with `@sentry/node`'s
// vendored OTel graphql instrumentation (re-exported from here so the two can't drift).
export type * from '../integrations/tracing-channel/graphql/graphql-types';

/**
 * The canonical set of orchestrion diagnostics-channel integrations, keyed by their public
 * (OTel-parity) factory name.
 *
 * Single source of truth: add a new channel integration here and every consumer that spreads this map
 * into its default integrations picks it up automatically, so there's no separate list to keep in sync.
 *
 * NOTE: `ioredisChannelIntegration` and `redisChannelIntegration` are intentionally NOT here. They
 * only partially replace the composite OTel `Redis` integration and need the node SDK's redis cache
 * `responseHook` (which can't live in `server-utils`), so `@sentry/node` wires them up separately.
 *
 * Framework SDKs that own their own channel listener (e.g. `@sentry/nestjs`'s `Nest`) are NOT here
 * either: their transform config is still in `SENTRY_INSTRUMENTATIONS`, but the listener lives in
 * their package and picks the channel-vs-OTel path itself at `setupOnce`, so it needs no central swap.
 *
 * NOTE: `dataloaderIntegration` is also NOT here. Everything in this map is auto-appended to
 * the default integrations, but the OTel `Dataloader` integration is opt-in (never a default). Like
 * `@sentry/nestjs`'s `Nest`, its `@sentry/node` factory picks the channel-vs-OTel path itself at
 * `setupOnce` (via `isOrchestrionInjected()`), so there's nothing for the central swap to do.
 */
export const channelIntegrations = {
  postgresIntegration,
  postgresJsIntegration,
  mongoIntegration: mongodbIntegration,
  mysqlIntegration,
  mysql2Integration,
  genericPoolIntegration,
  mongooseIntegration,
  lruMemoizerIntegration,
  openaiIntegration,
  anthropicIntegration,
  googleGenAIIntegration,
  langChainIntegration,
  langGraphIntegration,
  vercelAiIntegration,
  amqplibIntegration,
  hapiIntegration,
  koaIntegration,
  expressIntegration,
  graphqlIntegration: graphqlDiagnosticsIntegration,
  kafkajsIntegration,
  tediousIntegration,
  awsIntegration,
  firebaseIntegration,
} as const;
