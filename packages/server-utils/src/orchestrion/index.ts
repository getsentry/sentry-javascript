import { amqplibChannelIntegration } from '../integrations/tracing-channel/amqplib';
import { anthropicChannelIntegration } from '../integrations/tracing-channel/anthropic';
import { awsChannelIntegration } from '../integrations/tracing-channel/aws-sdk';
import { dataloaderChannelIntegration } from '../integrations/tracing-channel/dataloader';
import { genericPoolChannelIntegration } from '../integrations/tracing-channel/generic-pool';
import { googleGenAIChannelIntegration } from '../integrations/tracing-channel/google-genai';
import {
  graphqlChannelIntegration,
  graphqlDiagnosticsChannelIntegration,
} from '../integrations/tracing-channel/graphql';
import { hapiChannelIntegration } from '../integrations/tracing-channel/hapi';
import { koaChannelIntegration } from '../integrations/tracing-channel/koa';
import { ioredisChannelIntegration } from '../integrations/tracing-channel/ioredis';
import { kafkajsChannelIntegration } from '../integrations/tracing-channel/kafkajs';
import { knexChannelIntegration } from '../integrations/tracing-channel/knex';
import { langChainChannelIntegration } from '../integrations/tracing-channel/langchain';
import { langGraphChannelIntegration } from '../integrations/tracing-channel/langgraph';
import { lruMemoizerChannelIntegration } from '../integrations/tracing-channel/lru-memoizer';
import { mongodbChannelIntegration } from '../integrations/tracing-channel/mongodb';
import { mongooseChannelIntegration } from '../integrations/tracing-channel/mongoose';
import { mysqlChannelIntegration } from '../integrations/tracing-channel/mysql';
import { mysql2ChannelIntegration } from '../integrations/tracing-channel/mysql2';
import { openaiChannelIntegration } from '../integrations/tracing-channel/openai';
import { postgresChannelIntegration } from '../integrations/tracing-channel/postgres';
import { postgresJsChannelIntegration } from '../integrations/tracing-channel/postgres-js';
import { tediousChannelIntegration } from '../integrations/tracing-channel/tedious';
import { vercelAiChannelIntegration } from '../integrations/tracing-channel/vercel-ai';
import { expressChannelIntegration } from '../integrations/tracing-channel/express';
import { firebaseChannelIntegration } from '../integrations/tracing-channel/firebase';

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
  amqplibChannelIntegration,
  anthropicChannelIntegration,
  awsChannelIntegration,
  dataloaderChannelIntegration,
  genericPoolChannelIntegration,
  googleGenAIChannelIntegration,
  graphqlChannelIntegration,
  hapiChannelIntegration,
  koaChannelIntegration,
  ioredisChannelIntegration,
  kafkajsChannelIntegration,
  knexChannelIntegration,
  langChainChannelIntegration,
  langGraphChannelIntegration,
  lruMemoizerChannelIntegration,
  mongodbChannelIntegration,
  mongooseChannelIntegration,
  mysqlChannelIntegration,
  mysql2ChannelIntegration,
  openaiChannelIntegration,
  postgresChannelIntegration,
  postgresJsChannelIntegration,
  tediousChannelIntegration,
  vercelAiChannelIntegration,
  expressChannelIntegration,
  firebaseChannelIntegration,
};
export type { KoaChannelIntegrationOptions } from '../integrations/tracing-channel/koa';
export type { IORedisChannelIntegrationOptions, IORedisResponseHook } from '../integrations/tracing-channel/ioredis';
export type { PostgresJsChannelIntegrationOptions } from '../integrations/tracing-channel/postgres-js';
export { redisChannelIntegration } from '../integrations/tracing-channel/redis';
export type { RedisChannelIntegrationOptions, RedisResponseHook } from '../integrations/tracing-channel/redis';
export type { InstrumentationConfig, CustomTransform } from '@apm-js-collab/code-transformer-bundler-plugins/core';

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
 *
 * NOTE: `dataloaderChannelIntegration` is also NOT here. Everything in this map is auto-appended to
 * the default integrations, but the OTel `Dataloader` integration is opt-in (never a default). Like
 * `@sentry/nestjs`'s `Nest`, its `@sentry/node` factory picks the channel-vs-OTel path itself at
 * `setupOnce` (via `isOrchestrionInjected()`), so there's nothing for the central swap to do.
 */
export const channelIntegrations = {
  postgresIntegration: postgresChannelIntegration,
  postgresJsIntegration: postgresJsChannelIntegration,
  mongoIntegration: mongodbChannelIntegration,
  mysqlIntegration: mysqlChannelIntegration,
  mysql2Integration: mysql2ChannelIntegration,
  genericPoolIntegration: genericPoolChannelIntegration,
  mongooseIntegration: mongooseChannelIntegration,
  lruMemoizerIntegration: lruMemoizerChannelIntegration,
  openaiIntegration: openaiChannelIntegration,
  anthropicIntegration: anthropicChannelIntegration,
  googleGenAIIntegration: googleGenAIChannelIntegration,
  langChainIntegration: langChainChannelIntegration,
  langGraphIntegration: langGraphChannelIntegration,
  vercelAiIntegration: vercelAiChannelIntegration,
  amqplibIntegration: amqplibChannelIntegration,
  hapiIntegration: hapiChannelIntegration,
  koaIntegration: koaChannelIntegration,
  expressIntegration: expressChannelIntegration,
  graphqlIntegration: graphqlDiagnosticsChannelIntegration,
  kafkajsIntegration: kafkajsChannelIntegration,
  tediousIntegration: tediousChannelIntegration,
  awsIntegration: awsChannelIntegration,
  firebaseIntegration: firebaseChannelIntegration,
} as const;
