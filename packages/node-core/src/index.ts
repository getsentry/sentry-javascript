import * as logger from './logs/exports';

export { httpIntegration } from './integrations/http';
export {
  SentryHttpInstrumentation,
  type SentryHttpInstrumentationOptions,
} from './integrations/http/SentryHttpInstrumentation';
export { nativeNodeFetchIntegration } from './integrations/node-fetch';
export {
  SentryNodeFetchInstrumentation,
  type SentryNodeFetchInstrumentationOptions,
} from './integrations/node-fetch/SentryNodeFetchInstrumentation';

export { nodeContextIntegration } from './integrations/context';
export { contextLinesIntegration } from './integrations/contextlines';
export { localVariablesIntegration } from './integrations/local-variables';
export { modulesIntegration } from './integrations/modules';
export { onUncaughtExceptionIntegration } from './integrations/onuncaughtexception';
export { onUnhandledRejectionIntegration } from './integrations/onunhandledrejection';
export { anrIntegration, disableAnrDetectionForCallback } from './integrations/anr';

export { spotlightIntegration } from './integrations/spotlight';
export { childProcessIntegration } from './integrations/childProcess';
export { createSentryWinstonTransport } from './integrations/winston';

export { SentryContextManager } from './otel/contextManager';
export { setupOpenTelemetryLogger } from './otel/logger';
export { generateInstrumentOnce, instrumentWhenWrapped, INSTRUMENTED } from './otel/instrument';

export { init, getDefaultIntegrations, initWithoutDefaultIntegrations, validateOpenTelemetrySetup } from './sdk';
export { setIsolationScope } from './sdk/scope';
export { getSentryRelease, defaultStackParser } from './sdk/api';
export { createGetModuleFromFilename } from './utils/module';
export { addOriginToSpan } from './utils/addOriginToSpan';
export { getRequestUrl } from './utils/getRequestUrl';
export { isCjs } from './utils/commonjs';
export { ensureIsWrapped } from './utils/ensureIsWrapped';
export { createMissingInstrumentationContext } from './utils/createMissingInstrumentationContext';
export { envToBool } from './utils/envToBool';
export { makeNodeTransport, type NodeTransportOptions } from './transports';
export type { HTTPModuleRequestIncomingMessage } from './transports/http-module';
export { NodeClient } from './sdk/client';
export { cron } from './cron';
export { NODE_VERSION } from './nodeVersion';

export type { NodeOptions } from './types';

export {
  // This needs exporting so the NodeClient can be used without calling init
  setOpenTelemetryContextAsyncContextStrategy as setNodeAsyncContextStrategy,
} from '@sentry/opentelemetry';

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
  consoleIntegration,
  wrapMcpServerWithSentry,
  featureFlagsIntegration,
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
