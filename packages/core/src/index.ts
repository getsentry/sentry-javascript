export type { ClientClass } from './sdk';
export type { AsyncContextStrategy, Carrier, Layer, RunWithAsyncContextOptions } from './hub';
export type { OfflineStore, OfflineTransportOptions } from './transports/offline';
export type { ServerRuntimeClientOptions } from './server-runtime-client';
export type { RequestDataIntegrationOptions } from './integrations/requestdata';

export * from './tracing';
export * from './semanticAttributes';
export { createEventEnvelope, createSessionEnvelope } from './envelope';
export {
  addBreadcrumb,
  captureCheckIn,
  withMonitor,
  captureException,
  captureEvent,
  captureMessage,
  close,
  // eslint-disable-next-line deprecation/deprecation
  configureScope,
  flush,
  // eslint-disable-next-line deprecation/deprecation
  lastEventId,
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
  getCurrentScope,
  startSession,
  endSession,
  captureSession,
  withActiveSpan,
} from './exports';
export {
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getIsolationScope,
  getHubFromCarrier,
  Hub,
  // eslint-disable-next-line deprecation/deprecation
  makeMain,
  getMainCarrier,
  runWithAsyncContext,
  setHubOnCarrier,
  ensureHubOnCarrier,
  setAsyncContextStrategy,
} from './hub';
export { makeSession, closeSession, updateSession } from './session';
export { SessionFlusher } from './sessionflusher';
export { Scope, getGlobalScope, setGlobalScope } from './scope';
export {
  notifyEventProcessors,
  // eslint-disable-next-line deprecation/deprecation
  addGlobalEventProcessor,
} from './eventProcessors';
export { getEnvelopeEndpointWithUrlEncodedAuth, getReportDialogEndpoint } from './api';
export { BaseClient, addEventProcessor } from './baseclient';
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
