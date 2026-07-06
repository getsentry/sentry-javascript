import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

export const vercelAiConfig = [
  // Vercel AI v6: mirror the v7 native `ai:telemetry` channel by injecting
  // channels into the top-level entry points. `resolveLanguageModel` is wrapped
  // not to span it, but so the subscriber can monkey-patch `doGenerate`/
  // `doStream` on the returned model (the only way to span the model call,
  // which is an inline call with no injectable definition in `ai`).
  // `streamText` returns its result synchronously (streaming is lazy), so it's
  // `Sync`; the subscriber binds the span via `bindTracingChannelToSpan`, which
  // ends it when the (synchronous) call returns.
  ...vercelAiV6Entries('generateText', 'generateText', 'Async'),
  ...vercelAiV6Entries('streamText', 'streamText', 'Sync'),
  ...vercelAiV6Entries('embed', 'embed', 'Async'),
  ...vercelAiV6Entries('embedMany', 'embedMany', 'Async'),
  ...vercelAiV6Entries('executeToolCall', 'executeToolCall', 'Async'),
  ...vercelAiV6Entries('resolveLanguageModel', 'resolveLanguageModel', 'Sync'),
] satisfies InstrumentationConfig[];

export const vercelAiChannels = {
  // Vercel AI (`ai`) v6: orchestrion injects these so the same channel-based
  // integration that consumes `ai`'s native `ai:telemetry` channel (v7) can
  // also instrument v6. Each maps to a top-level function in `ai`'s bundle.
  VERCEL_AI_GENERATE_TEXT: 'orchestrion:ai:generateText',
  VERCEL_AI_STREAM_TEXT: 'orchestrion:ai:streamText',
  VERCEL_AI_EMBED: 'orchestrion:ai:embed',
  VERCEL_AI_EMBED_MANY: 'orchestrion:ai:embedMany',
  VERCEL_AI_EXECUTE_TOOL_CALL: 'orchestrion:ai:executeToolCall',
  // `resolveLanguageModel` is the single chokepoint every model call flows
  // through; we wrap it to monkey-patch `doGenerate`/`doStream` on the returned
  // model (the model-call site itself is an inline call with no injectable
  // definition).
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
function vercelAiV6Entries(channelName: string, functionName: string, kind: 'Async' | 'Sync'): InstrumentationConfig[] {
  return ['dist/index.js', 'dist/index.mjs'].map(filePath => ({
    channelName,
    module: { name: 'ai', versionRange: '>=6.0.0 <7.0.0', filePath },
    functionQuery: { functionName, kind },
  }));
}
