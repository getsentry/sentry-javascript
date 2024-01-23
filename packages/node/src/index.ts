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
export type { AddRequestDataToEventOptions, TransactionNamingScheme } from '@sentry/utils';

export type { NodeOptions } from './types';

export {
  // eslint-disable-next-line deprecation/deprecation
  addGlobalEventProcessor,
  addEventProcessor,
  addBreadcrumb,
  addIntegration,
  captureException,
  captureEvent,
  captureMessage,
  close,
  // eslint-disable-next-line deprecation/deprecation
  configureScope,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  extractTraceparentData,
  flush,
  // eslint-disable-next-line deprecation/deprecation
  getActiveTransaction,
  getHubFromCarrier,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  Hub,
  // eslint-disable-next-line deprecation/deprecation
  lastEventId,
  // eslint-disable-next-line deprecation/deprecation
  makeMain,
  setCurrentClient,
  runWithAsyncContext,
  Scope,
  // eslint-disable-next-line deprecation/deprecation
  startTransaction,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  spanStatusfromHttpCode,
  // eslint-disable-next-line deprecation/deprecation
  trace,
  withScope,
  withIsolationScope,
  captureCheckIn,
  withMonitor,
  setMeasurement,
  getActiveSpan,
  startSpan,
  // eslint-disable-next-line deprecation/deprecation
  startActiveSpan,
  startInactiveSpan,
  startSpanManual,
  continueTrace,
  parameterize,
  metrics,
  functionToStringIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  requestDataIntegration,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';
export { autoDiscoverNodePerformanceMonitoringIntegrations } from './tracing';

export { NodeClient } from './client';
export { makeNodeTransport } from './transports';
export {
  // eslint-disable-next-line deprecation/deprecation
  defaultIntegrations,
  getDefaultIntegrations,
  init,
  defaultStackParser,
  getSentryRelease,
} from './sdk';
export { addRequestDataToEvent, DEFAULT_USER_INCLUDES, extractRequestData } from '@sentry/utils';
// eslint-disable-next-line deprecation/deprecation
export { deepReadDirSync } from './utils';

import { createGetModuleFromFilename } from './module';
/**
 * @deprecated use `createGetModuleFromFilename` instead.
 */
export const getModuleFromFilename = createGetModuleFromFilename();
export { createGetModuleFromFilename };

// eslint-disable-next-line deprecation/deprecation
export { enableAnrDetection } from './integrations/anr/legacy';

import { Integrations as CoreIntegrations } from '@sentry/core';

import * as Handlers from './handlers';
import * as NodeIntegrations from './integrations';
import * as TracingIntegrations from './tracing/integrations';

const INTEGRATIONS = {
  // eslint-disable-next-line deprecation/deprecation
  ...CoreIntegrations,
  ...NodeIntegrations,
  ...TracingIntegrations,
};

export { INTEGRATIONS as Integrations, Handlers };

export { hapiErrorPlugin } from './integrations/hapi';

import { instrumentCron } from './cron/cron';
import { instrumentNodeCron } from './cron/node-cron';
import { instrumentNodeSchedule } from './cron/node-schedule';

/** Methods to instrument cron libraries for Sentry check-ins */
export const cron = {
  instrumentCron,
  instrumentNodeCron,
  instrumentNodeSchedule,
};
