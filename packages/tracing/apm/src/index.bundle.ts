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
  Transports,
  withScope,
} from '@sentry/browser';

export { BrowserOptions } from '@sentry/browser';
export { BrowserClient, ReportDialogOptions } from '@sentry/browser';
export {
  defaultIntegrations,
  forceLoad,
  init,
  lastEventId,
  onLoad,
  showReportDialog,
  flush,
  close,
  wrap,
} from '@sentry/browser';
export { SDK_NAME, SDK_VERSION } from '@sentry/browser';

import { Integrations as BrowserIntegrations } from '@sentry/browser';
import { getGlobalObject } from '@sentry/utils';

import { addExtensionMethods } from './hubextensions';
import * as ApmIntegrations from './integrations';

export { Span, TRACEPARENT_REGEXP } from './span';

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
  ...BrowserIntegrations,
  Tracing: ApmIntegrations.Tracing,
};

export { INTEGRATIONS as Integrations };

// We are patching the global object with our hub extension methods
addExtensionMethods();
