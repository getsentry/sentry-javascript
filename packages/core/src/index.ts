export type { ClientClass } from './sdk';
export type { Layer } from './hub';
export type { AsyncContextStrategy, Carrier } from './asyncContext';
export type { OfflineStore, OfflineTransportOptions } from './transports/offline';
export type { ServerRuntimeClientOptions } from './server-runtime-client';
export type { RequestDataIntegrationOptions } from './integrations/requestdata';
export type { IntegrationIndex } from './integration';

export * from './tracing';
export * from './semanticAttributes';
export { createEventEnvelope, createSessionEnvelope, createAttachmentEnvelope } from './envelope';
export {
  captureCheckIn,
  withMonitor,
  captureException,
  captureEvent,
  captureMessage,
  close,
  flush,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  isInitialized,
  startSession,
  endSession,
  captureSession,
  addEventProcessor,
} from './exports';
export {
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  Hub,
  // eslint-disable-next-line deprecation/deprecation
  makeMain,
  getGlobalHub,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
} from './hub';
export {
  getCurrentScope,
  getIsolationScope,
  getGlobalScope,
  withScope,
  withIsolationScope,
  getClient,
} from './currentScopes';
export {
  getMainCarrier,
  setAsyncContextStrategy,
} from './asyncContext';
export { makeSession, closeSession, updateSession } from './session';
export { SessionFlusher } from './sessionflusher';
export { Scope } from './scope';
export {
  notifyEventProcessors,
  // eslint-disable-next-line deprecation/deprecation
  addGlobalEventProcessor,
} from './eventProcessors';
export { getEnvelopeEndpointWithUrlEncodedAuth, getReportDialogEndpoint } from './api';
export { BaseClient } from './baseclient';
export { ServerRuntimeClient } from './server-runtime-client';
export { initAndBind, setCurrentClient } from './sdk';
export { createTransport } from './transports/base';
export { makeOfflineTransport } from './transports/offline';
export { makeMultiplexedTransport } from './transports/multiplexed';
export { SDK_VERSION } from './version';
export {
  getIntegrationsToSetup,
  addIntegration,
  defineIntegration,
  // eslint-disable-next-line deprecation/deprecation
  convertIntegrationFnToClass,
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
} from './utils/spanUtils';
export { applySdkMetadata } from './utils/sdkMetadata';
export { DEFAULT_ENVIRONMENT } from './constants';
export { addBreadcrumb } from './breadcrumbs';
export { functionToStringIntegration } from './integrations/functiontostring';
export { inboundFiltersIntegration } from './integrations/inboundfilters';
export { linkedErrorsIntegration } from './integrations/linkederrors';
export { moduleMetadataIntegration } from './integrations/metadata';
export { requestDataIntegration } from './integrations/requestdata';
export { captureConsoleIntegration } from './integrations/captureconsole';
export { debugIntegration } from './integrations/debug';
export { dedupeIntegration } from './integrations/dedupe';
export { extraErrorDataIntegration } from './integrations/extraerrordata';
export { rewriteFramesIntegration } from './integrations/rewriteframes';
export { sessionTimingIntegration } from './integrations/sessiontiming';
export { metrics } from './metrics/exports';
export type { MetricData } from './metrics/exports';
export { metricsDefault } from './metrics/exports-default';
export { BrowserMetricsAggregator } from './metrics/browser-aggregator';
export { getMetricSummaryJsonForSpan } from './metrics/metric-summary';
export { addTracingHeadersToFetchRequest, instrumentFetchRequest } from './fetch';
