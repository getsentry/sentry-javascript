import { amqplibChannels } from './config/amqplib';
import { anthropicAiChannels } from './config/anthropic-ai';
import { dataloaderChannels } from './config/dataloader';
import { expressChannels } from './config/express';
import { firebaseChannels } from './config/firebase';
import { genericPoolChannels } from './config/generic-pool';
import { googleGenAiChannels } from './config/google-genai';
import { graphqlChannels } from './config/graphql';
import { hapiChannels } from './config/hapi';
import { ioredisChannels } from './config/ioredis';
import { kafkajsChannels } from './config/kafkajs';
import { knexChannels } from './config/knex';
import { langchainChannels } from './config/langchain';
import { langgraphChannels } from './config/langgraph';
import { lruMemoizerChannels } from './config/lru-memoizer';
import { mongodbChannels } from './config/mongodb';
import { mongooseChannels } from './config/mongoose';
import { mysql2Channels } from './config/mysql2';
import { mysqlChannels } from './config/mysql';
import { nestjsChannels } from './config/nestjs';
import { openaiChannels } from './config/openai';
import { pgChannels } from './config/pg';
import { postgresJsChannels } from './config/postgres';
import { prismaChannels } from './config/prisma';
import { reactRouterChannels } from './config/react-router';
import { redisChannels } from './config/redis';
import { remixChannels } from './config/remix';
import { tediousChannels } from './config/tedious';
import { vercelAiChannels } from './config/vercel-ai';

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
 *
 * Kept sorted alphabetically by module so concurrent additions insert at different
 * points rather than all appending to the end (fewer merge conflicts).
 */
export const CHANNELS = {
  ...amqplibChannels,
  ...anthropicAiChannels,
  ...dataloaderChannels,
  ...expressChannels,
  ...firebaseChannels,
  ...genericPoolChannels,
  ...googleGenAiChannels,
  ...graphqlChannels,
  ...hapiChannels,
  ...ioredisChannels,
  ...kafkajsChannels,
  ...knexChannels,
  ...langchainChannels,
  ...langgraphChannels,
  ...lruMemoizerChannels,
  ...mongodbChannels,
  ...mongooseChannels,
  ...mysql2Channels,
  ...mysqlChannels,
  ...nestjsChannels,
  ...openaiChannels,
  ...pgChannels,
  ...postgresJsChannels,
  ...prismaChannels,
  ...reactRouterChannels,
  ...redisChannels,
  ...remixChannels,
  ...tediousChannels,
  ...vercelAiChannels,
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
