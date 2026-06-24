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
    // `@nestjs/core/nest-factory.js` exports `class NestFactoryStatic` with an
    // `async create(moduleCls, serverOrOptions, options)` method (the app
    // bootstrap). A plain `className`+`methodName` match works here, unlike
    // mysql's prototype-assignment shape. `Async` ends the span on
    // `asyncEnd`, covering the full async bootstrap. Mirrors the vendored
    // `@opentelemetry/instrumentation-nestjs-core` `NestFactory.create` wrap.
    channelName: 'nestFactoryCreate',
    module: { name: '@nestjs/core', versionRange: '>=8.0.0 <12', filePath: 'nest-factory.js' },
    functionQuery: { className: 'NestFactoryStatic', methodName: 'create', kind: 'Async' },
  },
  {
    // `@nestjs/core/router/router-execution-context.js` exports
    // `class RouterExecutionContext` with a synchronous `create(instance,
    // callback, ...)` that RETURNS the per-request handler. The subscriber
    // wraps the `callback` arg (-> one handler span) and, via
    // `mutableResult: true`, replaces the returned handler
    // (-> request_context span). So `kind: 'Sync'` + `mutableResult: true`.
    // Mirrors vendored `@opentelemetry/instrumentation-nestjs-core`
    // `RouterExecutionContext.create` wrap.
    channelName: 'routerExecutionContextCreate',
    module: { name: '@nestjs/core', versionRange: '>=8.0.0 <12', filePath: 'router/router-execution-context.js' },
    functionQuery: { className: 'RouterExecutionContext', methodName: 'create', kind: 'Sync', mutableResult: true },
  },
  {
    // `@nestjs/common/decorators/core/injectable.decorator.js`:
    //   `function Injectable(options) { return (target) => { ... }; }`
    // The inner decorator arrow is anonymous + returned, so only a raw
    // `astQuery` can target it. The subscriber's `start` receives the
    // decorated class as `arguments[0]` and patches its prototype
    // use/canActivate/transform/intercept methods, reproducing the
    // vendored `SentryNestInstrumentation` middleware/guard/pipe/interceptor
    // spans. No span on the decorator itself, so `kind: 'Sync'` with no
    // `mutableResult`.
    channelName: 'injectableDecorator',
    module: {
      name: '@nestjs/common',
      versionRange: '>=8.0.0 <12',
      filePath: 'decorators/core/injectable.decorator.js',
    },
    astQuery: 'FunctionDeclaration[id.name="Injectable"] ReturnStatement > ArrowFunctionExpression',
    functionQuery: { kind: 'Sync' },
  },
  {
    // `@nestjs/common/decorators/core/catch.decorator.js`:
    //   `function Catch(...exceptions) { return (target) => { ... }; }`
    // Same anonymous-returned-arrow shape as `Injectable`. The subscriber's
    // `start` patches the exception filter's prototype `catch` method to
    // open an `exception_filter` span.
    //
    // Mirrors the vendored `SentryNestInstrumentation` `@Catch` wrap.
    channelName: 'catchDecorator',
    module: { name: '@nestjs/common', versionRange: '>=8.0.0 <12', filePath: 'decorators/core/catch.decorator.js' },
    astQuery: 'FunctionDeclaration[id.name="Catch"] ReturnStatement > ArrowFunctionExpression',
    functionQuery: { kind: 'Sync' },
  },
  // @nestjs/schedule @Cron/@Interval/@Timeout: `function Cron(...) { return
  // applyDecorators(...); }` — the returned decorator has no inline arrow to
  // target, so we match the factory function and use `mutableResult` to wrap the
  // decorator it returns (which rewrites the user handler `descriptor.value` with
  // isolation-scope + error capture). Mirrors `SentryNestScheduleInstrumentation`.
  // Version range scoped to the verified compiled shape (4.x).
  {
    channelName: 'cronDecorator',
    module: { name: '@nestjs/schedule', versionRange: '>=4.0.0 <5', filePath: 'dist/decorators/cron.decorator.js' },
    functionQuery: { functionName: 'Cron', kind: 'Sync', mutableResult: true },
  },
  {
    channelName: 'intervalDecorator',
    module: { name: '@nestjs/schedule', versionRange: '>=4.0.0 <5', filePath: 'dist/decorators/interval.decorator.js' },
    functionQuery: { functionName: 'Interval', kind: 'Sync', mutableResult: true },
  },
  {
    channelName: 'timeoutDecorator',
    module: { name: '@nestjs/schedule', versionRange: '>=4.0.0 <5', filePath: 'dist/decorators/timeout.decorator.js' },
    functionQuery: { functionName: 'Timeout', kind: 'Sync', mutableResult: true },
  },
  {
    // @nestjs/event-emitter @OnEvent: `const OnEvent = (event, options) => {
    //   const decoratorFactory = (t, k, d) => {…}; return decoratorFactory; }`
    // `OnEvent` is an arrow assigned to a const, so `expressionName`.
    // `mutableResult` wraps the returned decorator, which rewrites the handler to
    // open an `event.nestjs` span. Mirrors `SentryNestEventInstrumentation`.
    channelName: 'onEventDecorator',
    module: {
      name: '@nestjs/event-emitter',
      versionRange: '>=2.0.0 <3',
      filePath: 'dist/decorators/on-event.decorator.js',
    },
    functionQuery: { expressionName: 'OnEvent', kind: 'Sync', mutableResult: true },
  },
  {
    // @nestjs/bullmq @Processor: `function Processor(...) { return (target) => {…}; }`
    // The factory arg carries the queue name, so we match the factory and use
    // `mutableResult` to wrap the returned class decorator (which patches
    // `target.prototype.process`). Mirrors `SentryNestBullMQInstrumentation`.
    channelName: 'processorDecorator',
    module: {
      name: '@nestjs/bullmq',
      versionRange: '>=10.0.0 <12',
      filePath: 'dist/decorators/processor.decorator.js',
    },
    functionQuery: { functionName: 'Processor', kind: 'Sync', mutableResult: true },
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
