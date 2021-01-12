import { SDK_VERSION } from '@sentry/browser';
import { setSDKInfo } from '@sentry/utils';

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

setSDKInfo('sentry.javascript.angular', 'npm:@sentry/angular', SDK_VERSION);
