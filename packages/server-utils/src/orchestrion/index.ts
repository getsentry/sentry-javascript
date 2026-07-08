import { extendIntegration } from '@sentry/core';
import { graphqlIntegration as graphqlNativeIntegration } from '../graphql';
import type { GraphqlDiagnosticChannelsOptions } from '../graphql/graphql-dc-subscriber';
import { anthropicChannelIntegration } from '../integrations/tracing-channel/anthropic';
import { googleGenAIChannelIntegration } from '../integrations/tracing-channel/google-genai';
import { graphqlChannelIntegration } from '../integrations/tracing-channel/graphql';
import { hapiChannelIntegration } from '../integrations/tracing-channel/hapi';
import { ioredisChannelIntegration } from '../integrations/tracing-channel/ioredis';
import { lruMemoizerChannelIntegration } from '../integrations/tracing-channel/lru-memoizer';
import { mysqlChannelIntegration } from '../integrations/tracing-channel/mysql';
import { openaiChannelIntegration } from '../integrations/tracing-channel/openai';
import { postgresChannelIntegration } from '../integrations/tracing-channel/postgres';
import { postgresJsChannelIntegration } from '../integrations/tracing-channel/postgres-js';
import { vercelAiChannelIntegration } from '../integrations/tracing-channel/vercel-ai';

export { detectOrchestrionSetup, isOrchestrionInjected } from './detect';
export {
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
  hapiIntegration: hapiChannelIntegration,
  // graphql: the native subscriber (v17) composed with the orchestrion subscriber (v14–16), so opting
  // into injection instruments every supported version via diagnostics channels without the OTel patcher.
  graphqlIntegration: (options?: GraphqlDiagnosticChannelsOptions) => {
    const orchestrion = graphqlChannelIntegration(options);
    return extendIntegration(graphqlNativeIntegration(options), {
      name: 'Graphql',
      setupOnce: () => orchestrion.setupOnce?.(),
    });
  },
} as const;
