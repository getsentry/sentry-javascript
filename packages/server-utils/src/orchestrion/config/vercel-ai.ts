import type { InstrumentationConfig } from '..';

export const vercelAiConfig = [
  // Vercel AI v6: mirror the v7 native `ai:telemetry` channel by injecting
  // channels into the top-level entry points. `resolveLanguageModel` is wrapped
  // not to span it, but so the subscriber can monkey-patch `doGenerate`/
  // `doStream` on the returned model (the only way to span the model call,
  // which is an inline call with no injectable definition in `ai`).
  // `streamText` returns its result synchronously (streaming is lazy), so it's
  // `Sync`; the subscriber binds the span via `bindTracingChannelToSpan`, which
  // ends it when the (synchronous) call returns.

  // The majority of entrypoints are present in all versions we support
  ...vercelAiEntries('>=4.0.0 <7.0.0', 'generateText', 'generateText', 'Async'),
  ...vercelAiEntries('>=4.0.0 <7.0.0', 'streamText', 'streamText', 'Sync'),
  ...vercelAiEntries('>=4.0.0 <7.0.0', 'generateObject', 'generateObject', 'Async'),
  ...vercelAiEntries('>=4.0.0 <7.0.0', 'embed', 'embed', 'Async'),
  ...vercelAiEntries('>=4.0.0 <7.0.0', 'embedMany', 'embedMany', 'Async'),

  // The following entry is only present in v5 and later
  ...vercelAiEntries('>=5.0.0 <7.0.0', 'resolveLanguageModel', 'resolveLanguageModel', 'Sync'),

  // The following entry is only present in v6 and later
  ...vercelAiEntries('>=6.0.0 <7.0.0', 'executeToolCall', 'executeToolCall', 'Async'),
] satisfies InstrumentationConfig[];

export const vercelAiChannels = {
  // Vercel AI (`ai`): orchestrion injects these so the same channel-based
  // integration that consumes `ai`'s native `ai:telemetry` channel (v7) can
  // also instrument v4/v5/v6. Each maps to a top-level function in `ai`'s bundle.
  // All three versions share the same channel names (the subscriber is version-agnostic);
  // `VERCEL_AI_EXECUTE_TOOL_CALL` is v6-only (v4/v5 have no `executeToolCall` export) and
  // `VERCEL_AI_RESOLVE_LANGUAGE_MODEL` is v5/v6-only (v4 has no such chokepoint).
  VERCEL_AI_GENERATE_TEXT: 'orchestrion:ai:generateText',
  VERCEL_AI_STREAM_TEXT: 'orchestrion:ai:streamText',
  VERCEL_AI_GENERATE_OBJECT: 'orchestrion:ai:generateObject',
  VERCEL_AI_EMBED: 'orchestrion:ai:embed',
  VERCEL_AI_EMBED_MANY: 'orchestrion:ai:embedMany',
  VERCEL_AI_EXECUTE_TOOL_CALL: 'orchestrion:ai:executeToolCall',
  VERCEL_AI_RESOLVE_LANGUAGE_MODEL: 'orchestrion:ai:resolveLanguageModel',
} as const;

/**
 * The central list of channel injections orchestrion should perform.
 *
 * This module has NO side effects — it's the only thing both the runtime hook
 * (`runtime/import-hook.mjs`) and the bundler plugins (`bundler/vite.ts`, …)
 * import from. Adding a new instrumented method is one entry here plus one
 * subscriber in `integrations/<lib>/tracing-channel.ts`.
 *
 * `channelName` here is the unprefixed suffix; the actual diagnostics_channel
 * name is `orchestrion:${module.name}:${channelName}` (see `channels.ts`).
 */
/**
 * `ai` ships a single bundled entry per module system, so each instrumented
 * function needs one config entry per file (the app loads whichever matches its
 * module system). This expands a single target into both.
 */
function vercelAiEntries(
  versionRange: string,
  channelName: string,
  functionName: string,
  kind: 'Async' | 'Sync',
): InstrumentationConfig[] {
  return ['dist/index.js', 'dist/index.mjs'].map(filePath => ({
    channelName,
    module: { name: 'ai', versionRange, filePath },
    functionQuery: { functionName, kind },
  }));
}
