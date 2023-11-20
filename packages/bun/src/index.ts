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
  addGlobalEventProcessor,
  addBreadcrumb,
  addIntegration,
  captureException,
  captureEvent,
  captureMessage,
  close,
  configureScope,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
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
  withMonitor,
  setMeasurement,
  getActiveSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  continueTrace,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';
export { autoDiscoverNodePerformanceMonitoringIntegrations } from '@sentry/node';

export { BunClient } from './client';
export { defaultIntegrations, init } from './sdk';

import { Integrations as CoreIntegrations } from '@sentry/core';
import { Integrations as NodeIntegrations } from '@sentry/node';

import * as BunIntegrations from './integrations';

const INTEGRATIONS = {
  ...CoreIntegrations,
  ...NodeIntegrations,
  ...BunIntegrations,
};

export { INTEGRATIONS as Integrations };
