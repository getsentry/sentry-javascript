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
  Metric,
  ExclusiveEventHintOrCaptureContext,
  CaptureContext,
} from '@sentry/core';

export type { CloudflareOptions } from './client';

export {
  addEventProcessor,
  addBreadcrumb,
  addIntegration,
  captureException,
  captureEvent,
  captureMessage,
  captureFeedback,
  close,
  createTransport,
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
  withActiveSpan,
  getSpanDescendants,
  continueTrace,
  functionToStringIntegration,
  // eslint-disable-next-line deprecation/deprecation
  inboundFiltersIntegration,
  instrumentOpenAiClient,
  instrumentGoogleGenAIClient,
  instrumentAnthropicAiClient,
  eventFiltersIntegration,
  linkedErrorsIntegration,
  requestDataIntegration,
  extraErrorDataIntegration,
  dedupeIntegration,
  rewriteFramesIntegration,
  captureConsoleIntegration,
  moduleMetadataIntegration,
  supabaseIntegration,
  instrumentSupabaseClient,
  zodErrorsIntegration,
  consoleIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  trpcMiddleware,
  spanToJSON,
  spanToTraceHeader,
  spanToBaggageHeader,
  updateSpanName,
  wrapMcpServerWithSentry,
  consoleLoggingIntegration,
  createConsolaReporter,
  createLangChainCallbackHandler,
  featureFlagsIntegration,
  growthbookIntegration,
  logger,
  metrics,
  instrumentLangGraph,
} from '@sentry/core';

export { withSentry } from './handler';
export { instrumentDurableObjectWithSentry } from './durableobject';
export { sentryPagesPlugin } from './pages-plugin';

export { wrapRequestHandler } from './request';

export { CloudflareClient } from './client';
export { getDefaultIntegrations } from './sdk';

export { fetchIntegration } from './integrations/fetch';
export { vercelAIIntegration } from './integrations/tracing/vercelai';
export { honoIntegration } from './integrations/hono';

export { instrumentD1WithSentry } from './d1';

export { instrumentWorkflowWithSentry } from './workflows';

export { setAsyncLocalStorageAsyncContextStrategy } from './async';
