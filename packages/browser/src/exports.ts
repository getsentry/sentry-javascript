export {
  Breadcrumb,
  BreadcrumbHint,
  Request,
  SdkInfo,
  Event,
  EventHint,
  EventStatus,
  Exception,
  Response,
  // eslint-disable-next-line deprecation/deprecation
  Severity,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  User,
} from '@sentry/types';

export {
  addGlobalEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  makeMain,
  Scope,
  Session,
  startTransaction,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
} from '@sentry/core';

export { BrowserClient, BrowserOptions } from './client';

export {
  defaultStackParsers,
  chromeStackParser,
  geckoStackParser,
  opera10StackParser,
  opera11StackParser,
  winjsStackParser,
} from './stack-parsers';
export { injectReportDialog, ReportDialogOptions } from './helpers';
export { defaultIntegrations, forceLoad, init, lastEventId, onLoad, showReportDialog, flush, close, wrap } from './sdk';
export { SDK_NAME } from './version';
