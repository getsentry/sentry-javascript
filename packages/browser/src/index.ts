export {
  Breadcrumb,
  Request,
  SdkInfo,
  Event,
  Exception,
  Response,
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
  Span,
  withScope,
} from '@sentry/core';

export { BrowserOptions } from './backend';
export { BrowserClient, ReportDialogOptions } from './client';
export { defaultIntegrations, forceLoad, init, lastEventId, onLoad, showReportDialog, flush, close, wrap } from './sdk';
export { SDK_NAME, SDK_VERSION } from './version';
export { addInstrumentationHandler } from './instrument';

import { Integrations as CoreIntegrations } from '@sentry/core';
import { getGlobalObject } from '@sentry/utils';

import * as BrowserIntegrations from './integrations';
import * as Transports from './transports';

let windowIntegrations = {};

// This block is needed to add compatibility with the integrations packages when used with a CDN
// tslint:disable: no-unsafe-any
const _window = getGlobalObject<Window>();
if (_window.Sentry && _window.Sentry.Integrations) {
  windowIntegrations = _window.Sentry.Integrations;
}
// tslint:enable: no-unsafe-any

const INTEGRATIONS = {
  ...windowIntegrations,
  ...CoreIntegrations,
  ...BrowserIntegrations,
};

export { INTEGRATIONS as Integrations, Transports };
