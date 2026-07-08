import { mysqlChannels } from './config/mysql';
import { lruMemoizerChannels } from './config/lru-memoizer';
import { ioredisChannels } from './config/ioredis';
import { pgChannels } from './config/pg';
import { postgresJsChannels } from './config/postgres';
import { openaiChannels } from './config/openai';
import { anthropicAiChannels } from './config/anthropic-ai';
import { googleGenAiChannels } from './config/google-genai';
import { vercelAiChannels } from './config/vercel-ai';
import { hapiChannels } from './config/hapi';
import { redisChannels } from './config/redis';
import { expressChannels } from './config/express';
import { graphqlChannels } from './config/graphql';

/**
 * Fully-qualified `diagnostics_channel` names that orchestrion publishes to.
 *
 * Orchestrion's transform always prefixes the configured `channelName` with
 * `orchestrion:${module.name}:`. So a config of
 *   `{ channelName: 'query', module: { name: 'mysql' } }`
 * publishes to `orchestrion:mysql:query`.
 *
 * Subscribers (`integrations/<lib>/tracing-channel.ts`) consume the full
 * prefixed string from this map; the config files set only the unprefixed
 * suffix in `channelName`. Keeping both pieces in one file is what guarantees
 * they don't drift apart and silently stop firing.
 */
export const CHANNELS = {
  ...mysqlChannels,
  ...lruMemoizerChannels,
  ...ioredisChannels,
  ...pgChannels,
  ...postgresJsChannels,
  ...openaiChannels,
  ...anthropicAiChannels,
  ...googleGenAiChannels,
  ...vercelAiChannels,
  ...hapiChannels,
  ...redisChannels,
  ...expressChannels,
  ...graphqlChannels,
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
