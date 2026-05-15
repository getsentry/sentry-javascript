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
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
