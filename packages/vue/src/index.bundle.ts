export type {
  Breadcrumb,
  Request,
  SdkInfo,
  Event,
  Exception,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  User,
} from '@sentry/types';

export type { BrowserOptions, ReportDialogOptions } from '@sentry/browser';

export {
  BrowserClient,
  defaultIntegrations,
  forceLoad,
  lastEventId,
  onLoad,
  showReportDialog,
  flush,
  close,
  wrap,
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
  SDK_VERSION,
} from '@sentry/browser';

import { Integrations as BrowserIntegrations } from '@sentry/browser';
import { WINDOW } from '@sentry/utils';

export { init } from './sdk';
export { vueRouterInstrumentation } from './router';
export { attachErrorHandler } from './errorhandler';
export { createTracingMixins } from './tracing';

let windowIntegrations = {};

// This block is needed to add compatibility with the integrations packages when used with a CDN
if (WINDOW.Sentry && WINDOW.Sentry.Integrations) {
  windowIntegrations = WINDOW.Sentry.Integrations;
}

const INTEGRATIONS = {
  ...windowIntegrations,
  ...BrowserIntegrations,
};

export { INTEGRATIONS as Integrations };
