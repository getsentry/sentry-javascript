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
  Span,
  StackFrame,
  Stacktrace,
  Thread,
  Transaction,
  User,
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
  close,
  configureScope,
  createTransport,
  extractTraceparentData,
  flush,
  getActiveTransaction,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  lastEventId,
  makeMain,
  runWithAsyncContext,
  Scope,
  startTransaction,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  spanStatusfromHttpCode,
  trace,
  withScope,
  captureCheckIn,
  setMeasurement,
  getActiveSpan,
  startSpan,
  // eslint-disable-next-line deprecation/deprecation
  startActiveSpan,
  startInactiveSpan,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';
export { autoDiscoverNodePerformanceMonitoringIntegrations } from './tracing';

export { NodeClient } from './client';
export { makeNodeTransport } from './transports';
export { defaultIntegrations, init, defaultStackParser, getSentryRelease } from './sdk';
export { addRequestDataToEvent, DEFAULT_USER_INCLUDES, extractRequestData } from './requestdata';
export { deepReadDirSync } from './utils';
export { getModuleFromFilename } from './module';

import { Integrations as CoreIntegrations } from '@sentry/core';

import * as Handlers from './handlers';
import * as NodeIntegrations from './integrations';
import * as TracingIntegrations from './tracing/integrations';

const INTEGRATIONS = {
  ...CoreIntegrations,
  ...NodeIntegrations,
  ...TracingIntegrations,
};

export { INTEGRATIONS as Integrations, Handlers };
