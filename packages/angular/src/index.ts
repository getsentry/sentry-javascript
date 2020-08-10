export * from '@sentry/browser';
export { createErrorHandler, ErrorHandlerOptions } from './errorhandler';
export {
  getActiveTransaction,
  routingInstrumentation,
  TraceClassDecorator,
  TraceMethodDecorator,
  TraceDirective,
  TraceService,
} from './tracing';
