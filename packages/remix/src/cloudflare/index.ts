export * from '@sentry/react';

export { captureRemixErrorBoundaryError } from '../client/errors';
export { withSentry } from '../client/performance';

import { instrumentBuild as instrumentRemixBuild, makeWrappedCreateRequestHandler } from '../server/instrumentServer';
export { makeWrappedCreateRequestHandler };

/**
 * Instruments a Remix build to capture errors and performance data.
 * @param build The Remix build to instrument.
 * @returns The instrumented Remix build.
 */
export const instrumentBuild: typeof instrumentRemixBuild = build => {
  return instrumentRemixBuild(build, {
    instrumentTracing: true,
  });
};

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
  // eslint-disable-next-line deprecation/deprecation
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
