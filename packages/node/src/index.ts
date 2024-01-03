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
  getActiveTransaction,
  getHubFromCarrier,
  getCurrentHub,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  Hub,
  // eslint-disable-next-line deprecation/deprecation
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
  // eslint-disable-next-line deprecation/deprecation
  startActiveSpan,
  startInactiveSpan,
  startSpanManual,
  continueTrace,
  metrics,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';
export { autoDiscoverNodePerformanceMonitoringIntegrations } from './tracing';

export { NodeClient } from './client';
export { makeNodeTransport } from './transports';
export { defaultIntegrations, init, defaultStackParser, getSentryRelease } from './sdk';
export { addRequestDataToEvent, DEFAULT_USER_INCLUDES, extractRequestData } from '@sentry/utils';
// eslint-disable-next-line deprecation/deprecation
export { deepReadDirSync } from './utils';
export { getModuleFromFilename } from './module';
// eslint-disable-next-line deprecation/deprecation
export { enableAnrDetection } from './integrations/anr/legacy';

import { Integrations as CoreIntegrations } from '@sentry/core';
import type { Integration, IntegrationClass } from '@sentry/types';

import * as Handlers from './handlers';
import * as NodeIntegrations from './integrations';
import * as TracingIntegrations from './tracing/integrations';

const INTEGRATIONS = {
  ...CoreIntegrations,
  // This typecast is somehow needed for now, probably because of the convertIntegrationFnToClass TS shenanigans
  // This is OK for now but should be resolved in v8 when we just pass the functional integrations directly
  ...(NodeIntegrations as {
    Console: IntegrationClass<Integration>;
    Http: typeof NodeIntegrations.Http;
    OnUncaughtException: IntegrationClass<Integration>;
    OnUnhandledRejection: IntegrationClass<Integration>;
    Modules: IntegrationClass<Integration>;
    ContextLines: IntegrationClass<Integration>;
    Context: IntegrationClass<Integration>;
    RequestData: IntegrationClass<Integration>;
    LocalVariables: IntegrationClass<Integration>;
    Undici: typeof NodeIntegrations.Undici;
    Spotlight: IntegrationClass<Integration>;
    Anr: IntegrationClass<Integration>;
    Hapi: IntegrationClass<Integration>;
  }),
  ...TracingIntegrations,
};

export { INTEGRATIONS as Integrations, Handlers };

export { hapiErrorPlugin } from './integrations/hapi';

import { instrumentCron } from './cron/cron';

/** Methods to instrument cron libraries for Sentry check-ins */
export const cron = {
  instrumentCron,
};
