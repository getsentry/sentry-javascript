export type { ClientClass } from './sdk';
export type { Layer } from './hub';
export type { AsyncContextStrategy, Carrier, RunWithAsyncContextOptions } from './asyncContext';
export type { OfflineStore, OfflineTransportOptions } from './transports/offline';
export type { ServerRuntimeClientOptions } from './server-runtime-client';
export type { RequestDataIntegrationOptions } from './integrations/requestdata';
export type { IntegrationIndex } from './integration';

export * from './tracing';
export * from './semanticAttributes';
export { createEventEnvelope, createSessionEnvelope } from './envelope';
export {
  captureCheckIn,
  withMonitor,
  captureException,
  captureEvent,
  captureMessage,
  close,
  flush,
  // eslint-disable-next-line deprecation/deprecation
  startTransaction,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
  withIsolationScope,
  getClient,
  isInitialized,
  startSession,
  endSession,
  captureSession,
  withActiveSpan,
  addEventProcessor,
} from './exports';
export {
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getHubFromCarrier,
  Hub,
  // eslint-disable-next-line deprecation/deprecation
  makeMain,
  setHubOnCarrier,
  ensureHubOnCarrier,
  runWithAsyncContext,
} from './hub';
export {
  getCurrentScope,
  getIsolationScope,
  getGlobalScope,
  setGlobalScope,
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
} from './utils/spanUtils';
export { getRootSpan } from './utils/getRootSpan';
export { applySdkMetadata } from './utils/sdkMetadata';
export { DEFAULT_ENVIRONMENT } from './constants';
/* eslint-disable deprecation/deprecation */
export { ModuleMetadata } from './integrations/metadata';
export { RequestData } from './integrations/requestdata';
export { InboundFilters } from './integrations/inboundfilters';
export { FunctionToString } from './integrations/functiontostring';
export { LinkedErrors } from './integrations/linkederrors';
export { addBreadcrumb } from './breadcrumbs';
/* eslint-enable deprecation/deprecation */
import * as INTEGRATIONS from './integrations';
export { functionToStringIntegration } from './integrations/functiontostring';
export { inboundFiltersIntegration } from './integrations/inboundfilters';
export { linkedErrorsIntegration } from './integrations/linkederrors';
export { moduleMetadataIntegration } from './integrations/metadata';
export { requestDataIntegration } from './integrations/requestdata';
export { metrics } from './metrics/exports';

/** @deprecated Import the integration function directly, e.g. `inboundFiltersIntegration()` instead of `new Integrations.InboundFilter(). */
const Integrations = INTEGRATIONS;

// eslint-disable-next-line deprecation/deprecation
export { Integrations };
