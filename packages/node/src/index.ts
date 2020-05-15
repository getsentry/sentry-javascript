export {
  Breadcrumb,
  BreadcrumbHint,
  Request,
  SdkInfo,
  Event,
  EventHint,
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
  withScope,
} from '@sentry/core';

export { NodeOptions } from './backend';
export { NodeClient } from './client';
export { defaultIntegrations, init, lastEventId, flush, close } from './sdk';
export { SDK_NAME, SDK_VERSION } from './version';

import { Integrations as CoreIntegrations } from '@sentry/core';
import { getMainCarrier } from '@sentry/hub';
import * as domain from 'domain';

import * as Handlers from './handlers';
import * as NodeIntegrations from './integrations';
import * as Parsers from './parsers';
import * as Transports from './transports';

const INTEGRATIONS = {
  ...CoreIntegrations,
  ...NodeIntegrations,
};

export { INTEGRATIONS as Integrations, Transports, Parsers, Handlers };

// We need to patch domain on the global __SENTRY__ object to make it work for node
// if we don't do this, browser bundlers will have troubles resolving require('domain')
const carrier = getMainCarrier();
if (carrier.__SENTRY__) {
  carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
  if (!carrier.__SENTRY__.extensions.domain) {
    // @ts-ignore
    carrier.__SENTRY__.extensions.domain = domain;
  }
}
