export type { ClientClass as SentryCoreCurrentScopes } from './sdk';
export type { AsyncContextStrategy } from './asyncContext/types';
export type { Carrier } from './carrier';
export type { OfflineStore, OfflineTransportOptions } from './transports/offline';
export type { ServerRuntimeClientOptions } from './server-runtime-client';
export type { RequestDataIntegrationOptions } from './integrations/requestdata';
export type { IntegrationIndex } from './integration';

export * from './tracing';
export * from './semanticAttributes';
export { createEventEnvelope, createSessionEnvelope, createSpanEnvelope } from './envelope';
export {
  captureCheckIn,
  withMonitor,
  captureException,
  captureEvent,
  captureMessage,
  lastEventId,
  close,
  flush,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  isInitialized,
  isEnabled,
  startSession,
  endSession,
  captureSession,
  addEventProcessor,
} from './exports';
export {
  getCurrentScope,
  getIsolationScope,
  getGlobalScope,
  withScope,
  withIsolationScope,
  getClient,
  getTraceContextFromScope,
} from './currentScopes';
export {
  getDefaultCurrentScope,
  getDefaultIsolationScope,
} from './defaultScopes';
export { setAsyncContextStrategy } from './asyncContext';
export { getGlobalSingleton, getMainCarrier } from './carrier';
export { makeSession, closeSession, updateSession } from './session';
// eslint-disable-next-line deprecation/deprecation
export { SessionFlusher } from './sessionflusher';
export { Scope } from './scope';
export type { CaptureContext, ScopeContext, ScopeData } from './scope';
export { notifyEventProcessors } from './eventProcessors';
export { getEnvelopeEndpointWithUrlEncodedAuth, getReportDialogEndpoint } from './api';
export { BaseClient } from './baseclient';
export { ServerRuntimeClient } from './server-runtime-client';
export { initAndBind, setCurrentClient } from './sdk';
export { createTransport } from './transports/base';
export { makeOfflineTransport } from './transports/offline';
export { makeMultiplexedTransport } from './transports/multiplexed';
export {
  getIntegrationsToSetup,
  addIntegration,
  defineIntegration,
} from './integration';
export { applyScopeDataToEvent, mergeScopeData } from './utils/applyScopeDataToEvent';
export { prepareEvent } from './utils/prepareEvent';
export { createCheckInEnvelope } from './checkin';
export { hasTracingEnabled } from './utils/hasTracingEnabled';
export { isSentryRequestUrl } from './utils/isSentryRequestUrl';
export { handleCallbackErrors } from './utils/handleCallbackErrors';
export { parameterize } from './utils/parameterize';
export {
  spanToTraceHeader,
  spanToJSON,
  spanIsSampled,
  spanToTraceContext,
  getSpanDescendants,
  getStatusMessage,
  getRootSpan,
  getActiveSpan,
  addChildSpanToSpan,
  spanTimeInputToSeconds,
  updateSpanName,
} from './utils/spanUtils';
export { parseSampleRate } from './utils/parseSampleRate';
export { applySdkMetadata } from './utils/sdkMetadata';
export { getTraceData } from './utils/traceData';
export { getTraceMetaTags } from './utils/meta';
export { DEFAULT_ENVIRONMENT } from './constants';
export { addBreadcrumb } from './breadcrumbs';
export { functionToStringIntegration } from './integrations/functiontostring';
export { inboundFiltersIntegration } from './integrations/inboundfilters';
export { linkedErrorsIntegration } from './integrations/linkederrors';
export { moduleMetadataIntegration } from './integrations/metadata';
export { requestDataIntegration } from './integrations/requestdata';
export { captureConsoleIntegration } from './integrations/captureconsole';
export { dedupeIntegration } from './integrations/dedupe';
export { extraErrorDataIntegration } from './integrations/extraerrordata';
export { rewriteFramesIntegration } from './integrations/rewriteframes';
export { zodErrorsIntegration } from './integrations/zoderrors';
export { thirdPartyErrorFilterIntegration } from './integrations/third-party-errors-filter';
// eslint-disable-next-line deprecation/deprecation
export { metrics } from './metrics/exports';
export { profiler } from './profiling';
// eslint-disable-next-line deprecation/deprecation
export { metricsDefault } from './metrics/exports-default';
export { BrowserMetricsAggregator } from './metrics/browser-aggregator';
export { getMetricSummaryJsonForSpan } from './metrics/metric-summary';
export {
  // eslint-disable-next-line deprecation/deprecation
  addTracingHeadersToFetchRequest,
  instrumentFetchRequest,
} from './fetch';
export { trpcMiddleware } from './trpc';
export { captureFeedback } from './feedback';

// eslint-disable-next-line deprecation/deprecation
export { getCurrentHubShim, getCurrentHub } from './getCurrentHubShim';

// TODO(v9): Make this structure pretty again and don't do "export *"
export * from './utils-hoist/index';
// TODO(v9): Make this structure pretty again and don't do "export *"
export * from './types-hoist/index';

export type { FeatureFlag } from './featureFlags';
