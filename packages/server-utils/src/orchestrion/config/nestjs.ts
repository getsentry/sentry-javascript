import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

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
] satisfies InstrumentationConfig[];

export const nestjsChannels = {
  NESTJS_APP_CREATION: 'orchestrion:@nestjs/core:nestFactoryCreate',
  NESTJS_ROUTER_CONTEXT: 'orchestrion:@nestjs/core:routerExecutionContextCreate',
} as const;
