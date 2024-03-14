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
  createTransport,
  flush,
  // eslint-disable-next-line deprecation/deprecation
  getActiveTransaction,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getClient,
  isInitialized,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  Hub,
  // eslint-disable-next-line deprecation/deprecation
  makeMain,
  setCurrentClient,
  Scope,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  getSpanStatusFromHttpCode,
  setHttpStatus,
  withScope,
  withIsolationScope,
  captureCheckIn,
  withMonitor,
  setMeasurement,
  getActiveSpan,
  getRootSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  getSpanDescendants,
  continueTrace,
  parameterize,
  functionToStringIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  requestDataIntegration,
  metricsDefault as metrics,
  startSession,
  captureSession,
  endSession,
} from '@sentry/core';

export {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
} from '@sentry/core';

export { autoDiscoverNodePerformanceMonitoringIntegrations } from './tracing';

export { NodeClient } from './client';
export { makeNodeTransport } from './transports';
export {
  getDefaultIntegrations,
  init,
  defaultStackParser,
  getSentryRelease,
} from './sdk';
export { addRequestDataToEvent, DEFAULT_USER_INCLUDES, extractRequestData } from '@sentry/utils';

export { createGetModuleFromFilename } from './module';

import * as Handlers from './handlers';
import * as NodeIntegrations from './integrations';
import * as TracingIntegrations from './tracing/integrations';

// TODO: Deprecate this once we migrated tracing integrations
export const Integrations = {
  ...NodeIntegrations,
  ...TracingIntegrations,
};

export {
  captureConsoleIntegration,
  debugIntegration,
  dedupeIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  sessionTimingIntegration,
} from '@sentry/core';

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
