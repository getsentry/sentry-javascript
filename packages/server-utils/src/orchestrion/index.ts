import { amqplibChannelIntegration } from '../integrations/tracing-channel/amqplib';
import { anthropicChannelIntegration } from '../integrations/tracing-channel/anthropic';
import { ioredisChannelIntegration } from '../integrations/tracing-channel/ioredis';
import { lruMemoizerChannelIntegration } from '../integrations/tracing-channel/lru-memoizer';
import { mysqlChannelIntegration } from '../integrations/tracing-channel/mysql';
import { openaiChannelIntegration } from '../integrations/tracing-channel/openai';
import { postgresChannelIntegration } from '../integrations/tracing-channel/postgres';
import { vercelAiChannelIntegration } from '../integrations/tracing-channel/vercel-ai';

export { detectOrchestrionSetup, isOrchestrionInjected } from './detect';
export {
  amqplibChannelIntegration,
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
  amqplibIntegration: amqplibChannelIntegration,
} as const;
