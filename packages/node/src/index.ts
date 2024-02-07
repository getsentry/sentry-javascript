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
  isInitialized,
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
  getSpanStatusFromHttpCode,
  setHttpStatus,
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

// TODO: Deprecate this once we migrated tracing integrations
export const Integrations = {
  // eslint-disable-next-line deprecation/deprecation
  ...CoreIntegrations,
  ...NodeIntegrations,
  ...TracingIntegrations,
};

export { consoleIntegration } from './integrations/console';
export { onUncaughtExceptionIntegration } from './integrations/onuncaughtexception';
export { onUnhandledRejectionIntegration } from './integrations/onunhandledrejection';
export { modulesIntegration } from './integrations/modules';
export { contextLinesIntegration } from './integrations/contextlines';
export { nodeContextIntegration } from './integrations/context';
export { localVariablesIntegration } from './integrations/local-variables';
export { spotlightIntegration } from './integrations/spotlight';
export { anrIntegration } from './integrations/anr';
export { hapiIntegration } from './integrations/hapi';
// eslint-disable-next-line deprecation/deprecation
export { Undici, nativeNodeFetchintegration } from './integrations/undici';
// eslint-disable-next-line deprecation/deprecation
export { Http, httpIntegration } from './integrations/http';

// TODO(v8): Remove all of these exports. They were part of a hotfix #10339 where we produced wrong .d.ts files because we were packing packages inside the /build folder.
export type { LocalVariablesIntegrationOptions } from './integrations/local-variables/common';
export type { DebugSession } from './integrations/local-variables/local-variables-sync';
export type { AnrIntegrationOptions } from './integrations/anr/common';
// ---

export { Handlers };

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
