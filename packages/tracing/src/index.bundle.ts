export type {
  Breadcrumb,
  Request,
  SdkInfo,
  Event,
  Exception,
  // eslint-disable-next-line deprecation/deprecation
  Severity,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  User,
} from '@sentry/types';

export type { BrowserOptions, ReportDialogOptions } from '@sentry/browser';

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
  Scope,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  startTransaction,
  makeFetchTransport,
  makeXHRTransport,
  withScope,
} from '@sentry/browser';

export { BrowserClient } from '@sentry/browser';
export {
  defaultIntegrations,
  defaultStackParser,
  forceLoad,
  init,
  lastEventId,
  onLoad,
  showReportDialog,
  flush,
  close,
  wrap,
} from '@sentry/browser';
export { SDK_VERSION } from '@sentry/browser';

import { addExtensionMethods, BrowserTracing } from '@sentry-internal/tracing';
import { Integrations as BrowserIntegrations } from '@sentry/browser';
import type { Integration } from '@sentry/types';
import { GLOBAL_OBJ } from '@sentry/utils';

export { Span } from '@sentry/core';

let windowIntegrations = {};

// This block is needed to add compatibility with the integrations packages when used with a CDN
if (GLOBAL_OBJ.Sentry && GLOBAL_OBJ.Sentry.Integrations) {
  windowIntegrations = GLOBAL_OBJ.Sentry.Integrations;
}

// For whatever reason, it does not recognize BrowserTracing or some of the BrowserIntegrations as Integration
const INTEGRATIONS: Record<
  string,
  Integration | typeof BrowserTracing | typeof BrowserIntegrations[keyof typeof BrowserIntegrations]
> = {
  ...windowIntegrations,
  ...BrowserIntegrations,
  BrowserTracing,
};

export { INTEGRATIONS as Integrations, BrowserTracing };

// We are patching the global object with our hub extension methods
addExtensionMethods();

export { addExtensionMethods };
