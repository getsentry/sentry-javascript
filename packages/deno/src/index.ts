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

export type { DenoOptions } from './types';

export {
  // eslint-disable-next-line deprecation/deprecation
  addGlobalEventProcessor,
  addEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  close,
  // eslint-disable-next-line deprecation/deprecation
  configureScope,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  extractTraceparentData,
  continueTrace,
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
  metrics,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  functionToStringIntegration,
  requestDataIntegration,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';

export { DenoClient } from './client';

export {
  // eslint-disable-next-line deprecation/deprecation
  defaultIntegrations,
  getDefaultIntegrations,
  init,
} from './sdk';

export { breadcrumbsIntegration, dedupeIntegration } from '@sentry/browser';
import { Integrations as CoreIntegrations } from '@sentry/core';

export { denoContextIntegration } from './integrations/context';
export { globalHandlersIntegration } from './integrations/globalhandlers';
export { normalizePathsIntegration } from './integrations/normalizepaths';
export { contextLinesIntegration } from './integrations/contextlines';
export { denoCronIntegration } from './integrations/deno-cron';

import * as DenoIntegrations from './integrations';

/** @deprecated Import the integration function directly, e.g. `inboundFiltersIntegration()` instead of `new Integrations.InboundFilter(). */
export const Integrations = {
  // eslint-disable-next-line deprecation/deprecation
  ...CoreIntegrations,
  ...DenoIntegrations,
};
