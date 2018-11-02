export {
  Breadcrumb,
  Request,
  SdkInfo,
  SentryEvent,
  SentryException,
  SentryResponse,
  Severity,
  StackFrame,
  Stacktrace,
  Status,
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
  withScope,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  Scope,
} from '@sentry/core';

export { BrowserBackend, BrowserOptions } from './backend';
export { BrowserClient, ReportDialogOptions } from './client';
export { defaultIntegrations, forceLoad, init, lastEventId, onLoad, showReportDialog } from './sdk';
export { SDK_NAME, SDK_VERSION } from './version';

import { Integrations as CoreIntegrations } from '@sentry/core';
import * as BrowserIntegrations from './integrations';
import * as Transports from './transports';

const INTEGRATIONS = {
  ...CoreIntegrations,
  ...BrowserIntegrations,
};

export { INTEGRATIONS as Integrations, Transports };
