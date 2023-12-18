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
  // eslint-disable-next-line deprecation/deprecation
  addGlobalEventProcessor,
  addEventProcessor,
  addBreadcrumb,
  addIntegration,
  captureException,
  captureEvent,
  captureMessage,
  close,
  configureScope,
  createTransport,
  flush,
  getHubFromCarrier,
  getCurrentHub,
  getClient,
  getCurrentScope,
  Hub,
  lastEventId,
  makeMain,
  Scope,
  startTransaction,
  getActiveSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  continueTrace,
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
  metrics,
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
export { eventFromException, eventFromMessage, exceptionFromError } from './eventbuilder';
export { createUserFeedbackEnvelope } from './userfeedback';
export {
  defaultIntegrations,
  forceLoad,
  init,
  onLoad,
  showReportDialog,
  captureUserFeedback,
  // eslint-disable-next-line deprecation/deprecation
  wrap,
} from './sdk';
export { GlobalHandlers, TryCatch, Breadcrumbs, LinkedErrors, HttpContext, Dedupe } from './integrations';
