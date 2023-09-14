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
  startSpanManual,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';
export { autoDiscoverNodePerformanceMonitoringIntegrations } from '@sentry/node';

export { BunClient } from './client';
export { makeNodeTransport } from '@sentry/node';
export type { NodeTransportOptions } from '@sentry/node';
export { defaultIntegrations, init } from './sdk';

import { Integrations as CoreIntegrations } from '@sentry/core';
import { Integrations as NodeIntegrations } from '@sentry/node';

const INTEGRATIONS = {
  ...CoreIntegrations,
  ...NodeIntegrations,
};

export { INTEGRATIONS as Integrations };
