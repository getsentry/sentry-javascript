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
  // Vercel AI (`ai`) v6: orchestrion injects these so the same channel-based
  // integration that consumes `ai`'s native `ai:telemetry` channel (v7) can
  // also instrument v6. Each maps to a top-level function in `ai`'s bundle.
  VERCEL_AI_GENERATE_TEXT: 'orchestrion:ai:generateText',
  VERCEL_AI_STREAM_TEXT: 'orchestrion:ai:streamText',
  VERCEL_AI_EMBED: 'orchestrion:ai:embed',
  VERCEL_AI_EXECUTE_TOOL_CALL: 'orchestrion:ai:executeToolCall',
  // `resolveLanguageModel` is the single chokepoint every model call flows
  // through; we wrap it to monkey-patch `doGenerate`/`doStream` on the returned
  // model (the model-call site itself is an inline call with no injectable
  // definition).
  VERCEL_AI_RESOLVE_LANGUAGE_MODEL: 'orchestrion:ai:resolveLanguageModel',
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
