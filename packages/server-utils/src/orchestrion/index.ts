import { amqplibIntegration } from '../integrations/amqplib';
import { anthropicIntegration } from '../integrations/anthropic';
import { awsIntegration } from '../integrations/aws-sdk';
import { dataloaderIntegration } from '../integrations/dataloader';
import { genericPoolIntegration } from '../integrations/generic-pool';
import { googleGenAIIntegration } from '../integrations/google-genai';
import { graphqlIntegration, graphqlDiagnosticsIntegration } from '../integrations/graphql';
import { hapiIntegration } from '../integrations/hapi';
import { koaIntegration } from '../integrations/koa';
import { ioredisChannelIntegration } from '../integrations/ioredis';
import { kafkajsIntegration } from '../integrations/kafkajs';
import { knexIntegration } from '../integrations/knex';
import { langChainIntegration } from '../integrations/langchain';
import { langGraphIntegration } from '../integrations/langgraph';
import { lruMemoizerIntegration } from '../integrations/lru-memoizer';
import { mongodbIntegration } from '../integrations/mongodb';
import { mongooseIntegration } from '../integrations/mongoose';
import { mysqlIntegration } from '../integrations/mysql';
import { mysql2Integration } from '../integrations/mysql2';
import { openAIIntegration } from '../integrations/openai';
import { postgresIntegration } from '../integrations/postgres';
import { postgresJsIntegration } from '../integrations/postgres-js';
import { tediousIntegration } from '../integrations/tedious';
import { vercelAiIntegration } from '../integrations/vercel-ai';
import { expressIntegration } from '../integrations/express';
import { firebaseIntegration } from '../integrations/firebase';

export { detectOrchestrionSetup, isOrchestrionInjected } from './detect';
// The runtime target of the snippet the bundler transform splices into every
// instrumented module: records the module on the global marker (plus its
// subscriber factory, when it has one) and emits the module-injected event.
export { orchestrionModuleInjected } from './moduleInjected';
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
  openAIIntegration,
  postgresIntegration,
  postgresJsIntegration,
  tediousIntegration,
  vercelAiIntegration,
  expressIntegration,
  firebaseIntegration,
};
export type { KoaIntegrationOptions } from '../integrations/koa';
export type { PostgresJsIntegrationOptions } from '../integrations/postgres-js';
export { redisIntegration } from '../integrations/redis';
export type { InstrumentationConfig, CustomTransform } from './apmTypes';

// The structural `graphql` package types are the single source of truth shared with `@sentry/node`'s
// vendored OTel graphql instrumentation (re-exported from here so the two can't drift).
export type * from '../integrations/graphql/graphql-types';

/**
 * The canonical set of orchestrion diagnostics-channel integrations, keyed by their public
 * (OTel-parity) factory name.
 *
 * Single source of truth: add a new channel integration here and every consumer that spreads this map
 * into its default integrations picks it up automatically, so there's no separate list to keep in sync.
 *
 * NOTE: `ioredisChannelIntegration` and `redisIntegration` are intentionally NOT here. They only
 * partially replace the composite OTel `Redis` integration, so `@sentry/node` composes them into a
 * single `Redis` integration (gated against the OTel one) and wires them up separately.
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
  openAIIntegration,
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
