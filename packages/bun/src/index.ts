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

export type { TransactionNamingScheme } from '@sentry/node';
export type { BunOptions } from './types';

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
  // eslint-disable-next-line deprecation/deprecation
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
  // eslint-disable-next-line deprecation/deprecation
  spanStatusfromHttpCode,
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
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  continueTrace,
  metrics,
  functionToStringIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  requestDataIntegration,
  parameterize,
  startSession,
  captureSession,
  endSession,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';
export {
  // eslint-disable-next-line deprecation/deprecation
  deepReadDirSync,
  // eslint-disable-next-line deprecation/deprecation
  enableAnrDetection,
  // eslint-disable-next-line deprecation/deprecation
  getModuleFromFilename,
  DEFAULT_USER_INCLUDES,
  autoDiscoverNodePerformanceMonitoringIntegrations,
  cron,
  createGetModuleFromFilename,
  defaultStackParser,
  extractRequestData,
  getSentryRelease,
  addRequestDataToEvent,
  anrIntegration,
  consoleIntegration,
  contextLinesIntegration,
  hapiIntegration,
  httpIntegration,
  localVariablesIntegration,
  modulesIntegration,
  nativeNodeFetchintegration,
  nodeContextIntegration,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
  spotlightIntegration,
  captureConsoleIntegration,
  dedupeIntegration,
  debugIntegration,
  extraErrorDataIntegration,
  reportingObserverIntegration,
  rewriteFramesIntegration,
  sessionTimingIntegration,
  httpClientIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  trpcMiddleware,
} from '@sentry/node';

export { BunClient } from './client';
export {
  // eslint-disable-next-line deprecation/deprecation
  defaultIntegrations,
  getDefaultIntegrations,
  init,
} from './sdk';

import { Integrations as CoreIntegrations } from '@sentry/core';
import { Integrations as NodeIntegrations } from '@sentry/node';
import { BunServer } from './integrations/bunserver';
export { bunServerIntegration } from './integrations/bunserver';

const INTEGRATIONS = {
  // eslint-disable-next-line deprecation/deprecation
  ...CoreIntegrations,
  // eslint-disable-next-line deprecation/deprecation
  ...NodeIntegrations,
  BunServer,
};

export { INTEGRATIONS as Integrations };
