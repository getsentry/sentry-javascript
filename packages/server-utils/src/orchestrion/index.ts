import { amqplibIntegration } from '../integrations/amqplib';
import { anthropicAIIntegration } from '../integrations/anthropic';
import { awsIntegration } from '../integrations/aws-sdk';
import { dataloaderIntegration } from '../integrations/dataloader';
import { genericPoolIntegration } from '../integrations/generic-pool';
import { googleGenAIIntegration } from '../integrations/google-genai';
import { graphqlIntegration } from '../integrations/graphql';
import { hapiIntegration } from '../integrations/hapi';
import { koaIntegration } from '../integrations/koa';
import { redisIntegration } from '../integrations/redis';
import { kafkaIntegration } from '../integrations/kafkajs';
import { knexIntegration } from '../integrations/knex';
import { langChainIntegration } from '../integrations/langchain';
import { langGraphIntegration } from '../integrations/langgraph';
import { lruMemoizerIntegration } from '../integrations/lru-memoizer';
import { mongoIntegration } from '../integrations/mongodb';
import { mongooseIntegration } from '../integrations/mongoose';
import { mysqlIntegration } from '../integrations/mysql';
import { mysql2Integration } from '../integrations/mysql2';
import { openAIIntegration } from '../integrations/openai';
import { postgresIntegration } from '../integrations/postgres';
import { postgresJsIntegration } from '../integrations/postgres-js';
import { tediousIntegration } from '../integrations/tedious';
import { vercelAIIntegration } from '../integrations/vercel-ai';
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
  anthropicAIIntegration,
  awsIntegration,
  dataloaderIntegration,
  genericPoolIntegration,
  googleGenAIIntegration,
  graphqlIntegration,
  hapiIntegration,
  koaIntegration,
  redisIntegration,
  kafkaIntegration,
  knexIntegration,
  langChainIntegration,
  langGraphIntegration,
  lruMemoizerIntegration,
  mongoIntegration,
  mongooseIntegration,
  mysqlIntegration,
  mysql2Integration,
  openAIIntegration,
  postgresIntegration,
  postgresJsIntegration,
  tediousIntegration,
  vercelAIIntegration,
  expressIntegration,
  firebaseIntegration,
};
export type { InstrumentationConfig } from './apmTypes';

/**
 * The canonical set of orchestrion diagnostics-channel integrations, keyed by their public
 * (OTel-parity) factory name.
 *
 * Single source of truth: add a new channel integration here and every consumer that spreads this map
 * into its default integrations picks it up automatically, so there's no separate list to keep in sync.
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
  mongoIntegration,
  mysqlIntegration,
  mysql2Integration,
  genericPoolIntegration,
  mongooseIntegration,
  lruMemoizerIntegration,
  openAIIntegration,
  anthropicAIIntegration,
  googleGenAIIntegration,
  langChainIntegration,
  langGraphIntegration,
  vercelAIIntegration,
  amqplibIntegration,
  hapiIntegration,
  koaIntegration,
  expressIntegration,
  graphqlIntegration,
  kafkaIntegration,
  tediousIntegration,
  awsIntegration,
  firebaseIntegration,
  redisIntegration,
} as const;
