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
  getCurrentHub,
  getHubFromCarrier,
  Hub,
  Scope,
  withScope,
} from '@sentry/core';

export { NodeOptions } from './backend';
export { NodeClient } from './client';
export { defaultIntegrations, init, flush, close } from './sdk';
export { SDK_NAME, SDK_VERSION } from './version';

import { Integrations as CoreIntegrations } from '@sentry/core';
import * as Handlers from './handlers';
import * as NodeIntegrations from './integrations';
import * as Transports from './transports';

const INTEGRATIONS = {
  ...CoreIntegrations,
  ...NodeIntegrations,
};

export { INTEGRATIONS as Integrations, Transports, Handlers };
