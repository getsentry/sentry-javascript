export {
  Breadcrumb,
  Context,
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
  clearScope,
  configureScope,
  popScope,
  pushScope,
  withScope,
  ScopeInstance,
} from '@sentry/shim';

export { BrowserBackend, BrowserOptions } from './backend';
export { BrowserClient } from './client';
export { init, getCurrentClient } from './sdk';
