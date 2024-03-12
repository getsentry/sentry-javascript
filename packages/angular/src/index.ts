export type { ErrorHandlerOptions } from './errorhandler';

export * from '@sentry/browser';

export { init } from './sdk';
export { createErrorHandler, SentryErrorHandler } from './errorhandler';
export {
  // eslint-disable-next-line deprecation/deprecation
  getActiveTransaction,
  browserTracingIntegration,
  TraceClassDecorator,
  TraceMethodDecorator,
  TraceDirective,
  TraceModule,
  TraceService,
} from './tracing';
