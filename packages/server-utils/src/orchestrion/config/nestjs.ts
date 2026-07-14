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

/**
 * NestJS is different from the other instrumentations here. It's a standalone
 * metaframework SDK (`@sentry/nestjs`), so its channel LISTENER lives in that
 * package rather than in `server-utils`. Only the code-transform config (and
 * the channel names below) live here, so `@nestjs/*` is transformed whenever
 * orchestrion is enabled, same as every other library.
 *
 * `@sentry/nestjs` imports {@link nestjsChannels} to subscribe, and picks the
 * channel-vs-OTel path based on the global injection flag.
 */
export const nestjsConfig = [
  {
    channelName: 'nestFactoryCreate',
    module: { name: '@nestjs/core', versionRange: '>=8.0.0 <12', filePath: 'nest-factory.js' },
    functionQuery: { className: 'NestFactoryStatic', methodName: 'create', kind: 'Async' },
  },
  {
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
  // @nestjs/schedule @Cron/@Interval/@Timeout:
  // `function Cron(...) { return applyDecorators(...); }`
  // The returned decorator has no inline arrow to target, so we match the
  // factory function and reassign `data.result` in `end` to wrap the
  // decorator it returns (which rewrites the user handler `descriptor.value`
  // with isolation-scope + error capture).
  // Mirrors `SentryNestScheduleInstrumentation`, whose supported range we
  // match so opting in doesn't drop coverage the OTel path had. The compiled
  // `function Cron(...)` declaration is unchanged across 2.x–5.x.
  {
    channelName: 'cronDecorator',
    module: { name: '@nestjs/schedule', versionRange: '>=2.0.0', filePath: 'dist/decorators/cron.decorator.js' },
    functionQuery: { functionName: 'Cron', kind: 'Sync' },
  },
  {
    channelName: 'intervalDecorator',
    module: { name: '@nestjs/schedule', versionRange: '>=2.0.0', filePath: 'dist/decorators/interval.decorator.js' },
    functionQuery: { functionName: 'Interval', kind: 'Sync' },
  },
  {
    channelName: 'timeoutDecorator',
    module: { name: '@nestjs/schedule', versionRange: '>=2.0.0', filePath: 'dist/decorators/timeout.decorator.js' },
    functionQuery: { functionName: 'Timeout', kind: 'Sync' },
  },
  {
    // @nestjs/event-emitter @OnEvent:
    // `const OnEvent = (event, options) => {
    //   const decoratorFactory = (t, k, d) => {...}; return decoratorFactory;
    // }`
    // `OnEvent` is an arrow assigned to a const, so `expressionName`. `end`
    // reassigns `data.result` to wrap the returned decorator, which rewrites
    // the handler to open an `event.nestjs` span.
    // Mirrors `SentryNestEventInstrumentation`; the `const OnEvent = (...) =>`
    // shape is unchanged across 2.x–3.x.
    channelName: 'onEventDecorator',
    module: {
      name: '@nestjs/event-emitter',
      versionRange: '>=2.0.0',
      filePath: 'dist/decorators/on-event.decorator.js',
    },
    functionQuery: { expressionName: 'OnEvent', kind: 'Sync' },
  },
  {
    // @nestjs/bullmq @Processor:
    // `function Processor(...) { return (target) => {...}; }`
    // The factory arg carries the queue name, so we match the factory and
    // reassign `data.result` in `end` to wrap the returned class decorator
    // (which patches `target.prototype.process`).
    // Mirrors `SentryNestBullMQInstrumentation`; the `function Processor(...)`
    // declaration is unchanged across
    // 10.x–11.x.
    channelName: 'processorDecorator',
    module: {
      name: '@nestjs/bullmq',
      versionRange: '>=10.0.0',
      filePath: 'dist/decorators/processor.decorator.js',
    },
    functionQuery: { functionName: 'Processor', kind: 'Sync' },
  },
] satisfies InstrumentationConfig[];

export const nestjsChannels = {
  NESTJS_APP_CREATION: 'orchestrion:@nestjs/core:nestFactoryCreate',
  NESTJS_ROUTER_CONTEXT: 'orchestrion:@nestjs/core:routerExecutionContextCreate',
  NESTJS_INJECTABLE: 'orchestrion:@nestjs/common:injectableDecorator',
  NESTJS_CATCH: 'orchestrion:@nestjs/common:catchDecorator',
  NESTJS_SCHEDULE_CRON: 'orchestrion:@nestjs/schedule:cronDecorator',
  NESTJS_SCHEDULE_INTERVAL: 'orchestrion:@nestjs/schedule:intervalDecorator',
  NESTJS_SCHEDULE_TIMEOUT: 'orchestrion:@nestjs/schedule:timeoutDecorator',
  NESTJS_ONEVENT: 'orchestrion:@nestjs/event-emitter:onEventDecorator',
  NESTJS_PROCESSOR: 'orchestrion:@nestjs/bullmq:processorDecorator',
} as const;
