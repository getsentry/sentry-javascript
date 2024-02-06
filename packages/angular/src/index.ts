export type { ErrorHandlerOptions } from './errorhandler';

export * from '@sentry/browser';

export { init } from './sdk';
export { createErrorHandler, SentryErrorHandler } from './errorhandler';
export {
  // eslint-disable-next-line deprecation/deprecation
  getActiveTransaction,
  // eslint-disable-next-line deprecation/deprecation
  instrumentAngularRouting, // new name
  // eslint-disable-next-line deprecation/deprecation
  routingInstrumentation, // legacy name
  browserTracingIntegration,
  TraceClassDecorator,
  TraceMethodDecorator,
  TraceDirective,
  TraceModule,
  TraceService,
} from './tracing';
