import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

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

export const SENTRY_INSTRUMENTATIONS: InstrumentationConfig[] = [
  {
    channelName: 'query',
    module: { name: 'mysql', versionRange: '>=2.0.0 <3', filePath: 'lib/Connection.js' },
    // `Connection` in mysql v2 is a constructor function (NOT a class):
    //   `function Connection(options) { ... }`
    //   `Connection.prototype.query = function query(sql, values, cb) { ... }`
    // orchestrion's `className`+`methodName` query only matches `class` declarations.
    // The named function expression on the right-hand side of the prototype
    // assignment is what we want — that's matched by `expressionName: 'query'`,
    // which produces the esquery selector
    //   `AssignmentExpression[left.property.name="query"] > FunctionExpression[async]`.
    // `Auto` so both `connection.query(sql, cb)` and `connection.query(sql)`
    // (streamable, no callback) get channel events. The transform picks
    // `wrapCallback` when the last arg is a function and `wrapPromise`
    // otherwise — for mysql's no-callback path the latter publishes
    // `start`/`end` synchronously around the original call and stores the
    // returned `Query` emitter on `ctx.result`, which the integration uses to
    // attach `'end'`/`'error'` listeners that finish the span.
    functionQuery: { expressionName: 'query', kind: 'Auto' },
  },
  {
    channelName: 'load',
    // `>=2.1.0` only: the named `function memoizedFunction()` the selector targets exists from 2.1.0
    module: { name: 'lru-memoizer', versionRange: '>=2.1.0 <4', filePath: 'lib/async.js' },
    functionQuery: { functionName: 'memoizedFunction', kind: 'Callback' },
  },
  // ioredis `<5.11.0` (>=5.11.0 publishes its own `ioredis:*` diagnostics_channel)
  ...['lib/redis.js', 'built/redis.js', 'built/redis/index.js'].flatMap((filePath): InstrumentationConfig[] => [
    {
      channelName: 'command',
      module: { name: 'ioredis', versionRange: '>=2.0.0 <5.0.0', filePath },
      functionQuery: { expressionName: 'sendCommand', kind: 'Async' },
    },
    {
      channelName: 'connect',
      module: { name: 'ioredis', versionRange: '>=2.0.0 <5.0.0', filePath },
      functionQuery: { expressionName: 'connect', kind: 'Async' },
    },
  ]),
  {
    channelName: 'command',
    module: { name: 'ioredis', versionRange: '>=5.0.0 <5.11.0', filePath: 'built/Redis.js' },
    functionQuery: { className: 'Redis', methodName: 'sendCommand', kind: 'Async' },
  },
  {
    channelName: 'connect',
    module: { name: 'ioredis', versionRange: '>=5.0.0 <5.11.0', filePath: 'built/Redis.js' },
    functionQuery: { className: 'Redis', methodName: 'connect', kind: 'Async' },
  },
  // OpenAI chat completions. `Completions.create` returns a thenable `APIPromise` with no callback arg,
  // so `kind: 'Auto'` resolves to `wrapPromise`. openai ships dual CJS/ESM and the matcher compares
  // `filePath` exactly, hence one entry per built file (`.js` for `require`, `.mjs` for `import`).
  ...(['resources/chat/completions/completions.js', 'resources/chat/completions/completions.mjs'].map(filePath => ({
    channelName: 'chat',
    module: { name: 'openai', versionRange: '>=4.0.0 <7', filePath },
    functionQuery: { className: 'Completions', methodName: 'create', kind: 'Auto' as const },
  })) satisfies InstrumentationConfig[]),
  // OpenAI responses API — same `create(body, options)` shape as chat completions.
  ...(['resources/responses/responses.js', 'resources/responses/responses.mjs'].map(filePath => ({
    channelName: 'responses',
    module: { name: 'openai', versionRange: '>=4.0.0 <7', filePath },
    functionQuery: { className: 'Responses', methodName: 'create', kind: 'Auto' as const },
  })) satisfies InstrumentationConfig[]),
  // OpenAI embeddings API — same `create(body, options)` shape as chat completions.
  ...(['resources/embeddings.js', 'resources/embeddings.mjs'].map(filePath => ({
    channelName: 'embeddings',
    module: { name: 'openai', versionRange: '>=4.0.0 <7', filePath },
    functionQuery: { className: 'Embeddings', methodName: 'create', kind: 'Auto' as const },
  })) satisfies InstrumentationConfig[]),
  // OpenAI conversations API — same `create(body, options)` shape as chat completions.
  ...(['resources/conversations/conversations.js', 'resources/conversations/conversations.mjs'].map(filePath => ({
    channelName: 'conversations',
    module: { name: 'openai', versionRange: '>=4.0.0 <7', filePath },
    functionQuery: { className: 'Conversations', methodName: 'create', kind: 'Auto' as const },
  })) satisfies InstrumentationConfig[]),
  // `pg` (node-postgres).
  // instruments `Client.prototype.query`/`connect` (both the JS and native
  // clients) plus `pg-pool`'s `Pool.prototype.connect`.
  // `Auto` covers the callback, promise, and streamable-`Submittable`
  // call shapes (like mysql).
  // `pg/lib/client.js` is `class Client { query() {...} connect() {...} }`,
  // so `className`+`methodName` matches directly.
  {
    channelName: 'query',
    module: { name: 'pg', versionRange: '>=8.0.3 <9', filePath: 'lib/client.js' },
    functionQuery: { className: 'Client', methodName: 'query', kind: 'Auto' },
  },
  {
    channelName: 'connect',
    module: { name: 'pg', versionRange: '>=8.0.3 <9', filePath: 'lib/client.js' },
    functionQuery: { className: 'Client', methodName: 'connect', kind: 'Auto' },
  },
  // The native client (`pg/lib/native/client.js`) is a constructor function,
  // not a class.
  // `Client.prototype.query = function (config, values, callback) {...}`
  // so it needs `expressionName` (the mysql shape), publishing to the SAME
  // `orchestrion:pg:query`/`:connect` channels as the JS client.
  {
    channelName: 'query',
    module: { name: 'pg', versionRange: '>=8.0.3 <9', filePath: 'lib/native/client.js' },
    functionQuery: { expressionName: 'query', kind: 'Auto' },
  },
  {
    channelName: 'connect',
    module: { name: 'pg', versionRange: '>=8.0.3 <9', filePath: 'lib/native/client.js' },
    functionQuery: { expressionName: 'connect', kind: 'Auto' },
  },
  // `pg-pool` is `class Pool extends EventEmitter { connect(cb) {...} }`.
  {
    channelName: 'connect',
    module: { name: 'pg-pool', versionRange: '>=2.0.0 <4', filePath: 'index.js' },
    functionQuery: { className: 'Pool', methodName: 'connect', kind: 'Auto' },
  },
  // One entry each for CJS/ESM
  ...(['resources/messages/messages.js', 'resources/messages/messages.mjs'].flatMap(filePath =>
    (['create', 'countTokens'] as const).map(methodName => ({
      channelName: 'chat',
      module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
      functionQuery: { className: 'Messages', methodName, kind: 'Auto' as const },
    })),
  ) satisfies InstrumentationConfig[]),
  ...(['resources/completions.js', 'resources/completions.mjs'].map(filePath => ({
    channelName: 'chat',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Completions', methodName: 'create', kind: 'Auto' as const },
  })) satisfies InstrumentationConfig[]),
  ...(['resources/beta/messages/messages.js', 'resources/beta/messages/messages.mjs'].map(filePath => ({
    channelName: 'chat',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Messages', methodName: 'create', kind: 'Auto' as const },
  })) satisfies InstrumentationConfig[]),
  ...(['resources/models.js', 'resources/models.mjs'].map(filePath => ({
    channelName: 'models',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Models', methodName: 'retrieve', kind: 'Auto' as const },
  })) satisfies InstrumentationConfig[]),
  // `messages.stream()` returns a synchronous emitter, not a promise, so `kind: 'Sync'` is required:
  // `Auto`'s promise wrapper never publishes `end` for a non-thenable return, so the span would never end.
  ...(['resources/messages/messages.js', 'resources/messages/messages.mjs'].map(filePath => ({
    channelName: 'messages-stream',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Messages', methodName: 'stream', kind: 'Sync' as const },
  })) satisfies InstrumentationConfig[]),
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
  ...vercelAiV6Entries('executeToolCall', 'executeToolCall', 'Async'),
  ...vercelAiV6Entries('resolveLanguageModel', 'resolveLanguageModel', 'Sync'),
];

/**
 * The unique set of package names instrumented by `SENTRY_INSTRUMENTATIONS`
 * (e.g. `['mysql']`).
 *
 * Bundler plugins MUST ensure these are actually bundled rather than
 * externalized: an externalized dependency is resolved from `node_modules` at
 * runtime and never passes through the code transform's `onLoad`, so its
 * diagnostics_channel calls are silently never injected.
 */
export const INSTRUMENTED_MODULE_NAMES: string[] = Array.from(new Set(SENTRY_INSTRUMENTATIONS.map(i => i.module.name)));

/**
 * Returns `external` with any instrumented packages removed, so a bundler that
 * uses an "external" denylist (esbuild, Bun, Rollup) still bundles — and thus
 * transforms — them. Matches an exact package name (`'mysql'`) or a subpath
 * (`'mysql/lib/...'`); wildcard/other patterns are left untouched. `undefined`
 * is returned unchanged.
 *
 * (Vite uses an `ssr.noExternal` allowlist instead, so it consumes
 * `INSTRUMENTED_MODULE_NAMES` directly rather than this helper.)
 */
export function withoutInstrumentedExternals(external: readonly string[] | undefined): string[] | undefined {
  if (!external) {
    return undefined;
  }
  return external.filter(
    entry => !INSTRUMENTED_MODULE_NAMES.some(name => entry === name || entry.startsWith(`${name}/`)),
  );
}
