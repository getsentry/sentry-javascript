export type {
  Breadcrumb,
  BreadcrumbHint,
  PolymorphicRequest,
  RequestEventData,
  SdkInfo,
  Event,
  EventHint,
  ErrorEvent,
  Exception,
  FeatureFlagsIntegration,
  Session,
  SeverityLevel,
  Span,
  StackFrame,
  Stacktrace,
  Thread,
  User,
} from '@sentry/core';

export type { DenoOptions } from './types';

export {
  addEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  captureFeedback,
  close,
  createTransport,
  continueTrace,
  lastEventId,
  flush,
  getClient,
  isInitialized,
  isEnabled,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
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
  getTraceData,
  getTraceMetaTags,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  startNewTrace,
  suppressTracing,
  // eslint-disable-next-line deprecation/deprecation
  inboundFiltersIntegration,
  eventFiltersIntegration,
  linkedErrorsIntegration,
  functionToStringIntegration,
  requestDataIntegration,
  captureConsoleIntegration,
  dedupeIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  supabaseIntegration,
  instrumentSupabaseClient,
  zodErrorsIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  startSession,
  captureSession,
  endSession,
  spanToJSON,
  spanToTraceHeader,
  spanToBaggageHeader,
  updateSpanName,
  wrapMcpServerWithSentry,
  featureFlagsIntegration,
} from '@sentry/core';

export { DenoClient } from './client';

export { getDefaultIntegrations, init } from './sdk';

export { denoContextIntegration } from './integrations/context';
export { globalHandlersIntegration } from './integrations/globalhandlers';
export { normalizePathsIntegration } from './integrations/normalizepaths';
export { contextLinesIntegration } from './integrations/contextlines';
export { denoCronIntegration } from './integrations/deno-cron';
export { breadcrumbsIntegration } from './integrations/breadcrumbs';
export { vercelAIIntegration } from './integrations/tracing/vercelai';
