export type { ErrorHandlerOptions } from './errorhandler';

export * from '@sentry/browser';

export { init } from './sdk';
export { createErrorHandler, SentryErrorHandler } from './errorhandler';
export {
  // eslint-disable-next-line deprecation/deprecation
  getActiveTransaction,
  // TODO `instrumentAngularRouting` is just an alias for `routingInstrumentation`; deprecate the latter at some point
  instrumentAngularRouting, // new name
  routingInstrumentation, // legacy name
  browserTracingIntegration,
  TraceClassDecorator,
  TraceMethodDecorator,
  TraceDirective,
  TraceModule,
  TraceService,
} from './tracing';
