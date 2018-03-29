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
} from '@sentry/shim';

export {
  addBreadcrumb,
  captureMessage,
  captureException,
  captureEvent,
  clearScope,
  popScope,
  pushScope,
  setUserContext,
  setTagsContext,
  setExtraContext,
  withScope,
} from '@sentry/shim';

export { BrowserBackend, BrowserOptions } from './backend';
export { BrowserFrontend } from './frontend';
export { create, getCurrentFrontend } from './sdk';
