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
export type { AddRequestDataToEventOptions } from '@sentry/utils';

export type { TransactionNamingScheme } from '@sentry/node-experimental';
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
  withScope,
  withIsolationScope,
  captureCheckIn,
  withMonitor,
  setMeasurement,
  getActiveSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  continueTrace,
  metricsDefault as metrics,
  functionToStringIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  requestDataIntegration,
  parameterize,
  startSession,
  captureSession,
  endSession,
  withActiveSpan,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';
export {
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
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
} from '@sentry/node-experimental';

export { BunClient } from './client';
export {
  getDefaultIntegrations,
  init,
} from './sdk';

import { Integrations as CoreIntegrations } from '@sentry/core';
import { Integrations as NodeIntegrations } from '@sentry/node-experimental';
import { BunServer } from './integrations/bunserver';
export { bunServerIntegration } from './integrations/bunserver';

const INTEGRATIONS = {
  // eslint-disable-next-line deprecation/deprecation
  ...CoreIntegrations,
  ...NodeIntegrations,
  BunServer,
};

export { INTEGRATIONS as Integrations };
