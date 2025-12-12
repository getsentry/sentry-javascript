// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
export type { ErrorHandlerOptions } from './errorhandler';

export * from '@sentry/browser';

export { init, getDefaultIntegrations } from './sdk';
export { createErrorHandler, SentryErrorHandler } from './errorhandler';
export {
  browserTracingIntegration,
  TraceClass,
  TraceMethod,
  TraceDirective,
  TraceModule,
  TraceService,
} from './tracing';
