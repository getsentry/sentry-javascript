export {
  Breadcrumb,
  Request,
  SdkInfo,
  SentryEvent,
  SentryException,
  Severity,
  StackFrame,
  Stacktrace,
  Thread,
  User,
} from '@sentry/types';

export {
  addBreadcrumb,
  captureMessage,
  captureException,
  captureEvent,
  configureScope,
  popScope,
  pushScope,
  withScope,
  Scope,
} from '@sentry/shim';

export { BrowserBackend, BrowserOptions } from './backend';
export { BrowserClient } from './client';
export { init, getCurrentClient } from './sdk';
