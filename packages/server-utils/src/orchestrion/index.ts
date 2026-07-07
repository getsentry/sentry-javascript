import { anthropicChannelIntegration } from '../integrations/tracing-channel/anthropic';
import { hapiChannelIntegration } from '../integrations/tracing-channel/hapi';
import { ioredisChannelIntegration } from '../integrations/tracing-channel/ioredis';
import { lruMemoizerChannelIntegration } from '../integrations/tracing-channel/lru-memoizer';
import { mysqlChannelIntegration } from '../integrations/tracing-channel/mysql';
import { openaiChannelIntegration } from '../integrations/tracing-channel/openai';
import { postgresChannelIntegration } from '../integrations/tracing-channel/postgres';
import { vercelAiChannelIntegration } from '../integrations/tracing-channel/vercel-ai';

export { detectOrchestrionSetup, isOrchestrionInjected } from './detect';
export {
  anthropicChannelIntegration,
  hapiChannelIntegration,
  ioredisChannelIntegration,
  lruMemoizerChannelIntegration,
  mysqlChannelIntegration,
  openaiChannelIntegration,
  postgresChannelIntegration,
  vercelAiChannelIntegration,
};
export type { IORedisChannelIntegrationOptions, IORedisResponseHook } from '../integrations/tracing-channel/ioredis';
export { redisChannelIntegration } from '../integrations/tracing-channel/redis';
export type { RedisChannelIntegrationOptions, RedisResponseHook } from '../integrations/tracing-channel/redis';

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
  mysqlIntegration: mysqlChannelIntegration,
  lruMemoizerIntegration: lruMemoizerChannelIntegration,
  openaiIntegration: openaiChannelIntegration,
  anthropicIntegration: anthropicChannelIntegration,
  vercelAiIntegration: vercelAiChannelIntegration,
  hapiIntegration: hapiChannelIntegration,
} as const;
