import * as logger from '../logs/exports';

// Light-specific exports
export { LightNodeClient } from './client';
export { init, getDefaultIntegrations, initWithoutDefaultIntegrations } from './sdk';
export { setAsyncLocalStorageAsyncContextStrategy } from './asyncLocalStorageStrategy';
export { httpServerIntegration } from './integrations/httpServerIntegration';

// Note: httpIntegration, httpServerSpansIntegration, nativeNodeFetchIntegration,
// and their instrumentation classes are NOT exported as they require OpenTelemetry
export { nodeContextIntegration } from '../integrations/context';
export { contextLinesIntegration } from '../integrations/contextlines';
export { localVariablesIntegration } from '../integrations/local-variables';
export { modulesIntegration } from '../integrations/modules';
export { onUncaughtExceptionIntegration } from '../integrations/onuncaughtexception';
export { onUnhandledRejectionIntegration } from '../integrations/onunhandledrejection';
// eslint-disable-next-line deprecation/deprecation
export { anrIntegration, disableAnrDetectionForCallback } from '../integrations/anr';
export { spotlightIntegration } from '../integrations/spotlight';
export { systemErrorIntegration } from '../integrations/systemError';
export { childProcessIntegration } from '../integrations/childProcess';
export { createSentryWinstonTransport } from '../integrations/winston';
export { pinoIntegration } from '../integrations/pino';

// SDK utilities (excluding OTEL-dependent ones)
// Note: SentryContextManager, setupOpenTelemetryLogger, generateInstrumentOnce,
// instrumentWhenWrapped, INSTRUMENTED, validateOpenTelemetrySetup, setIsolationScope,
// and ensureIsWrapped are NOT exported as they require OpenTelemetry
export { getSentryRelease, defaultStackParser } from '../sdk/api';
export { createGetModuleFromFilename } from '../utils/module';
export { addOriginToSpan } from '../utils/addOriginToSpan';
export { getRequestUrl } from '../utils/getRequestUrl';
export { initializeEsmLoader } from '../sdk/esmLoader';
export { isCjs } from '../utils/detection';
export { createMissingInstrumentationContext } from '../utils/createMissingInstrumentationContext';
export { envToBool } from '../utils/envToBool';
export { makeNodeTransport, type NodeTransportOptions } from '../transports';
export type { HTTPModuleRequestIncomingMessage } from '../transports/http-module';
export { cron } from '../cron';
export { NODE_VERSION } from '../nodeVersion';

export type { NodeOptions } from '../types';

// Re-export everything from @sentry/core that's safe to use
export {
  addBreadcrumb,
  isInitialized,
  isEnabled,
  getGlobalScope,
  lastEventId,
  close,
  createTransport,
  flush,
  SDK_VERSION,
  getSpanStatusFromHttpCode,
  setHttpStatus,
  captureCheckIn,
  withMonitor,
  requestDataIntegration,
  functionToStringIntegration,
  // eslint-disable-next-line deprecation/deprecation
  inboundFiltersIntegration,
  eventFiltersIntegration,
  linkedErrorsIntegration,
  addEventProcessor,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  setCurrentClient,
  Scope,
  setMeasurement,
  getSpanDescendants,
  parameterize,
  getClient,
  getCurrentScope,
  getIsolationScope,
  getTraceData,
  getTraceMetaTags,
  continueTrace,
  withScope,
  withIsolationScope,
  captureException,
  captureEvent,
  captureMessage,
  captureFeedback,
  captureConsoleIntegration,
  dedupeIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  startSession,
  captureSession,
  endSession,
  addIntegration,
  startSpan,
  startSpanManual,
  startInactiveSpan,
  startNewTrace,
  suppressTracing,
  getActiveSpan,
  withActiveSpan,
  getRootSpan,
  spanToJSON,
  spanToTraceHeader,
  spanToBaggageHeader,
  trpcMiddleware,
  updateSpanName,
  supabaseIntegration,
  instrumentSupabaseClient,
  zodErrorsIntegration,
  profiler,
  consoleLoggingIntegration,
  createConsolaReporter,
  consoleIntegration,
  wrapMcpServerWithSentry,
  featureFlagsIntegration,
  metrics,
} from '@sentry/core';

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
  Session,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  User,
  Span,
  FeatureFlagsIntegration,
} from '@sentry/core';

export { logger };
