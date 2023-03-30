export type {
  Breadcrumb,
  BreadcrumbHint,
  PolymorphicRequest,
  Request,
  SdkInfo,
  Event,
  EventHint,
  Exception,
  Session,
  // eslint-disable-next-line deprecation/deprecation
  Severity,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  User,
  Span,
} from '@sentry/types';
export type { AddRequestDataToEventOptions } from '@sentry/utils';

export type { TransactionNamingScheme } from './requestdata';
export type { NodeOptions } from './types';

export {
  addGlobalEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  createTransport,
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

export { NodeClient } from './client';
export { makeNodeTransport } from './transports';
export { defaultIntegrations, init, defaultStackParser, lastEventId, flush, close, getSentryRelease } from './sdk';
export { addRequestDataToEvent, DEFAULT_USER_INCLUDES, extractRequestData } from './requestdata';
export { deepReadDirSync } from './utils';

import { getMainCarrier, Integrations as CoreIntegrations } from '@sentry/core';
import * as domain from 'domain';

import * as Handlers from './handlers';
import * as NodeIntegrations from './integrations';

const INTEGRATIONS = {
  ...CoreIntegrations,
  ...NodeIntegrations,
};

export { INTEGRATIONS as Integrations, Handlers };

// We need to patch domain on the global __SENTRY__ object to make it work for node in cross-platform packages like
// @sentry/core. If we don't do this, browser bundlers will have troubles resolving `require('domain')`.
const carrier = getMainCarrier();
if (carrier.__SENTRY__) {
  carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
  carrier.__SENTRY__.extensions.domain = carrier.__SENTRY__.extensions.domain || domain;
}
