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
  withScope,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  Scope,
} from '@sentry/core';

export { BrowserOptions } from './backend';
export { BrowserClient, ReportDialogOptions } from './client';
export { defaultIntegrations, forceLoad, init, lastEventId, onLoad, showReportDialog, flush, close } from './sdk';
export { SDK_NAME, SDK_VERSION } from './version';

import { Integrations as CoreIntegrations } from '@sentry/core';
import { getGlobalObject } from '@sentry/utils/misc';

import * as BrowserIntegrations from './integrations';
import * as Transports from './transports';

let windowIntegrations = {};

// tslint:disable: no-unsafe-any
const _window = getGlobalObject<Window>() as any;
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
