export type {
  Breadcrumb,
  BreadcrumbHint,
  Request,
  SdkInfo,
  Event,
  EventHint,
  EventStatus,
  Exception,
  Response,
  Severity,
  StackFrame,
  Stacktrace,
  Thread,
  User,
} from '@sentry/types';

export type { SeverityLevel } from '@sentry/utils';

export type { BrowserOptions } from './backend';
export type { ReportDialogOptions } from './helpers';

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

export { BrowserClient } from './client';
export { injectReportDialog } from './helpers';
export { eventFromException, eventFromMessage } from './eventbuilder';
export { defaultIntegrations, forceLoad, init, lastEventId, onLoad, showReportDialog, flush, close, wrap } from './sdk';
export { SDK_NAME } from './version';
