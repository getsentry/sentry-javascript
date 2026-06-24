import type { FunctionKind, InstrumentationConfig } from '@apm-js-collab/code-transformer';

/**
 * Wrap an instrumentation that targets nodes via a raw esquery selector
 * (`NstQuery`) rather than the structured `functionQuery`. Needed when the
 * target can't be named, e.g. the anonymous arrow a decorator factory returns
 * The transformer supports `astQuery` at runtime (it takes precedence over
 * `functionQuery`, which then only supplies `kind`), but it isn't in the
 * published `InstrumentationConfig` type. Hence the cast.
 */
function astQueryInstrumentation(config: {
  channelName: string;
  module: InstrumentationConfig['module'];
  astQuery: string;
  functionQuery: { kind: FunctionKind };
}): InstrumentationConfig {
  return config as unknown as InstrumentationConfig;
}


export const nestjsConfig = [
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
    // wraps the `callback` arg (-> one handler span) and reassigns the returned
    // handler (-> request_context span).
    channelName: 'routerExecutionContextCreate',
    module: { name: '@nestjs/core', versionRange: '>=8.0.0 <12', filePath: 'router/router-execution-context.js' },
    functionQuery: { className: 'RouterExecutionContext', methodName: 'create', kind: 'Sync' },
  },
  astQueryInstrumentation({
    // `@nestjs/common/decorators/core/injectable.decorator.js`:
    //   `function Injectable(options) { return (target) => { ... }; }`
    // The inner decorator arrow is anonymous + returned, so only a raw
    // `astQuery` can target it. The subscriber's `start` receives the
    // decorated class as `arguments[0]` and patches its prototype
    // use/canActivate/transform/intercept methods, reproducing the
    // vendored `SentryNestInstrumentation` middleware/guard/pipe/interceptor
    // spans. No span on the decorator itself, so `kind: 'Sync'`.
    channelName: 'injectableDecorator',
    module: {
      name: '@nestjs/common',
      versionRange: '>=8.0.0 <12',
      filePath: 'decorators/core/injectable.decorator.js',
    },
    astQuery: 'FunctionDeclaration[id.name="Injectable"] ReturnStatement > ArrowFunctionExpression',
    functionQuery: { kind: 'Sync' },
  }),
  astQueryInstrumentation({
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
  }),

] satisfies InstrumentationConfig[];

export const nestjsChannels = {
  NESTJS_APP_CREATION: 'orchestrion:@nestjs/core:nestFactoryCreate',
  NESTJS_ROUTER_CONTEXT: 'orchestrion:@nestjs/core:routerExecutionContextCreate',
  NESTJS_INJECTABLE: 'orchestrion:@nestjs/common:injectableDecorator',
  NESTJS_CATCH: 'orchestrion:@nestjs/common:catchDecorator',
} as const;
