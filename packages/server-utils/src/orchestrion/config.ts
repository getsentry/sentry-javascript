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
  // Express funnels every middleware/route handler through a single method on
  // its routing `Layer`, so instrumenting that one method covers the whole
  // request pipeline. The `expressChannelIntegration` opens one span per layer
  // invocation. Both are `Layer.prototype.<method> = function <fn>(req, res, next)`
  // prototype assignments (not `class` methods), so `expressionName` (matching
  // the assignment's `left.property.name`) is used. `Callback`: the handler's
  // last argument is `next`, so the transform ends the traced operation when
  // `next` is invoked (and publishes `error` when it's called with an error).
  //
  // Express v4 ships its own router in `express/lib/router/layer.js`.
  {
    channelName: 'handle',
    module: { name: 'express', versionRange: '>=4.0.0 <5', filePath: 'lib/router/layer.js' },
    // v4's method is `Layer.prototype.handle_request = function handle(...)` —
    // match the assigned property name, not the function name.
    functionQuery: { expressionName: 'handle_request', kind: 'Callback' },
  },
  // Express v5 delegates routing to the standalone `router` package.
  {
    channelName: 'handle',
    module: { name: 'router', versionRange: '>=2.0.0 <3', filePath: 'lib/layer.js' },
    functionQuery: { expressionName: 'handleRequest', kind: 'Callback' },
  },
  // Layer *registration* methods. `Router.prototype.route`/`.use` are called
  // once per registered route/middleware (including internally by `app.get`/
  // `app.use`), so subscribing here lets us record each layer's registered path
  // *pattern* — which the handler path (`req.baseUrl`) can't recover for
  // parameterized mounts. `Sync`: these return synchronously and, unlike a
  // handler, `use`'s trailing function argument is a registration payload, not a
  // callback — so `Callback` would misclassify it and never fire `end`.
  //
  // Express v4 ships its own router in `express/lib/router/index.js`.
  {
    channelName: 'route',
    module: { name: 'express', versionRange: '>=4.0.0 <5', filePath: 'lib/router/index.js' },
    functionQuery: { expressionName: 'route', kind: 'Sync' },
  },
  {
    channelName: 'use',
    module: { name: 'express', versionRange: '>=4.0.0 <5', filePath: 'lib/router/index.js' },
    functionQuery: { expressionName: 'use', kind: 'Sync' },
  },
  // Express v5 delegates routing to the standalone `router` package.
  {
    channelName: 'route',
    module: { name: 'router', versionRange: '>=2.0.0 <3', filePath: 'index.js' },
    functionQuery: { expressionName: 'route', kind: 'Sync' },
  },
  {
    channelName: 'use',
    module: { name: 'router', versionRange: '>=2.0.0 <3', filePath: 'index.js' },
    functionQuery: { expressionName: 'use', kind: 'Sync' },
  },
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
