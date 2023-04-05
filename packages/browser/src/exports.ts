export type {
  Breadcrumb,
  BreadcrumbHint,
  Request,
  SdkInfo,
  Event,
  EventHint,
  Exception,
  // eslint-disable-next-line deprecation/deprecation
  Severity,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  Transaction,
  User,
  Session,
} from '@sentry/types';

export type { BrowserOptions } from './client';
export type { ReportDialogOptions } from './helpers';

export {
  addGlobalEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  createTransport,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  makeMain,
  Scope,
  startTransaction,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
  FunctionToString,
  InboundFilters,
} from '@sentry/core';

export { WINDOW } from './helpers';
export { BrowserClient } from './client';
export { makeFetchTransport, makeXHRTransport } from './transports';
export {
  defaultStackParser,
  defaultStackLineParsers,
  chromeStackLineParser,
  geckoStackLineParser,
  opera10StackLineParser,
  opera11StackLineParser,
  winjsStackLineParser,
} from './stack-parsers';
export { eventFromException, eventFromMessage } from './eventbuilder';
export { defaultIntegrations, forceLoad, init, lastEventId, onLoad, showReportDialog, flush, close, wrap } from './sdk';
export { captureUserFeedback } from './userfeedback';
export { GlobalHandlers, TryCatch, Breadcrumbs, LinkedErrors, HttpContext, Dedupe } from './integrations';
