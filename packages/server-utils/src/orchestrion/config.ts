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
