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
] satisfies InstrumentationConfig[];

export const nestjsChannels = {
  NESTJS_APP_CREATION: 'orchestrion:@nestjs/core:nestFactoryCreate',
} as const;
