import { amqplibChannelIntegration } from '../integrations/tracing-channel/amqplib';
import type { IntegrationFn } from '@sentry/core';
import { getInjectedOrchestrionInstrumentations } from './registry';
import { anthropicChannelIntegration } from '../integrations/tracing-channel/anthropic';
import { googleGenAIChannelIntegration } from '../integrations/tracing-channel/google-genai';
import {
  graphqlChannelIntegration,
  graphqlDiagnosticsChannelIntegration,
} from '../integrations/tracing-channel/graphql';
import { hapiChannelIntegration } from '../integrations/tracing-channel/hapi';
import { ioredisChannelIntegration } from '../integrations/tracing-channel/ioredis';
import { lruMemoizerChannelIntegration } from '../integrations/tracing-channel/lru-memoizer';
import { mysqlChannelIntegration } from '../integrations/tracing-channel/mysql';
import { openaiChannelIntegration } from '../integrations/tracing-channel/openai';
import { postgresChannelIntegration } from '../integrations/tracing-channel/postgres';
import { postgresJsChannelIntegration } from '../integrations/tracing-channel/postgres-js';
import { vercelAiChannelIntegration } from '../integrations/tracing-channel/vercel-ai';
import { expressChannelIntegration } from '../integrations/tracing-channel/express';

export { detectOrchestrionSetup, isOrchestrionInjected } from './detect';
export { registerOrchestrionInstrumentation, getInjectedOrchestrionInstrumentations } from './registry';
export type { OrchestrionInstrumentation, InstrumentationConfig, FunctionKind } from './registry';
export {
  amqplibChannelIntegration,
  anthropicChannelIntegration,
  googleGenAIChannelIntegration,
  graphqlChannelIntegration,
  hapiChannelIntegration,
  ioredisChannelIntegration,
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
 * opt-in helper (`experimentalUseDiagnosticsChannelInjection`) and its public
 * `diagnosticsChannelInjectionIntegrations()` map — picks it up automatically, so there's no separate
 * list to keep in sync.
 *
 * NOTE: `ioredisChannelIntegration` and `redisChannelIntegration` are intentionally NOT here. They
 * only partially replace the composite OTel `Redis` integration and need the node SDK's redis cache
 * `responseHook` (which can't live in `server-utils`), so `@sentry/node` wires them up separately.
 *
 * NOTE: `ioredisChannelIntegration` is intentionally NOT here. It only partially replaces the
 * composite OTel `Redis` integration and needs the node SDK's redis cache `responseHook` (which
 * can't live in `server-utils`), so `@sentry/node` wires it up separately.
 *
 * Framework packages that own their own channel integration (e.g. `@sentry/nestjs`'s `Nest`) are
 * NOT here either: they inject via the registry, and {@link getChannelIntegrations} merges them in.
 */
export const channelIntegrations = {
  postgresIntegration: postgresChannelIntegration,
  postgresJsIntegration: postgresJsChannelIntegration,
  mysqlIntegration: mysqlChannelIntegration,
  lruMemoizerIntegration: lruMemoizerChannelIntegration,
  openaiIntegration: openaiChannelIntegration,
  anthropicIntegration: anthropicChannelIntegration,
  googleGenAIIntegration: googleGenAIChannelIntegration,
  vercelAiIntegration: vercelAiChannelIntegration,
  amqplibIntegration: amqplibChannelIntegration,
  hapiIntegration: hapiChannelIntegration,
  expressIntegration: expressChannelIntegration,
  graphqlIntegration: graphqlDiagnosticsChannelIntegration,
} as const;

/**
 * The built-in channel-integration factories merged with any externally-injected ones (see the
 * registry). Each 1:1 replaces the OTel integration of the same `name`. This is the list the Node
 * SDK's opt-in helper instantiates and swaps in for the matching OTel integrations.
 */
export function getChannelIntegrations(): IntegrationFn[] {
  return [...Object.values(channelIntegrations), ...getInjectedOrchestrionInstrumentations().map(i => i.integration)];
}
