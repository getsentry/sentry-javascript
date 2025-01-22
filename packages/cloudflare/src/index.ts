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
  Span,
  StackFrame,
  Stacktrace,
  Thread,
  User,
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
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  requestDataIntegration,
  extraErrorDataIntegration,
  dedupeIntegration,
  rewriteFramesIntegration,
  captureConsoleIntegration,
  moduleMetadataIntegration,
  zodErrorsIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  trpcMiddleware,
  spanToJSON,
  spanToTraceHeader,
  spanToBaggageHeader,
  updateSpanName,
} from '@sentry/core';

export { withSentry } from './handler';
export { sentryPagesPlugin } from './pages-plugin';

export { wrapRequestHandler } from './request';

export { CloudflareClient } from './client';
export { getDefaultIntegrations } from './sdk';

export { fetchIntegration } from './integrations/fetch';

export { instrumentD1WithSentry } from './d1';
