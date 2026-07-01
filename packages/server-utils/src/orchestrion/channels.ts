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
  MYSQL_QUERY: 'orchestrion:mysql:query',
  LRU_MEMOIZER_LOAD: 'orchestrion:lru-memoizer:load',
  // Scoped package → the transform's `orchestrion:${module.name}:${channelName}` keeps the scope.
  ANTHROPIC_CHAT: 'orchestrion:@anthropic-ai/sdk:chat',
  ANTHROPIC_MODELS: 'orchestrion:@anthropic-ai/sdk:models',
  ANTHROPIC_MESSAGES_STREAM: 'orchestrion:@anthropic-ai/sdk:messages-stream',
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
