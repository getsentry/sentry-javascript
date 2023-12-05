export type { ClientClass } from './sdk';
export type { AsyncContextStrategy, Carrier, Layer, RunWithAsyncContextOptions } from './hub';
export type { OfflineStore, OfflineTransportOptions } from './transports/offline';
export type { ServerRuntimeClientOptions } from './server-runtime-client';
export type { RequestDataIntegrationOptions } from './integrations/requestdata';

export * from './tracing';
export { createEventEnvelope } from './envelope';
export {
  addBreadcrumb,
  captureCheckIn,
  withMonitor,
  captureException,
  captureEvent,
  captureMessage,
  close,
  configureScope,
  flush,
  lastEventId,
  startTransaction,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
  getClient,
} from './exports';
export {
  getCurrentHub,
  getHubFromCarrier,
  Hub,
  makeMain,
  getMainCarrier,
  runWithAsyncContext,
  setHubOnCarrier,
  ensureHubOnCarrier,
  setAsyncContextStrategy,
} from './hub';
export { makeSession, closeSession, updateSession } from './session';
export { SessionFlusher } from './sessionflusher';
export { Scope } from './scope';
export {
  // eslint-disable-next-line deprecation/deprecation
  addGlobalEventProcessor,
} from './eventProcessors';
export { getEnvelopeEndpointWithUrlEncodedAuth, getReportDialogEndpoint } from './api';
export { BaseClient, addEventProcessor } from './baseclient';
export { ServerRuntimeClient } from './server-runtime-client';
export { initAndBind } from './sdk';
export { createTransport } from './transports/base';
export { makeOfflineTransport } from './transports/offline';
export { makeMultiplexedTransport } from './transports/multiplexed';
export { SDK_VERSION } from './version';
export { getIntegrationsToSetup, addIntegration } from './integration';
export { FunctionToString, InboundFilters, LinkedErrors } from './integrations';
export { prepareEvent } from './utils/prepareEvent';
export { createCheckInEnvelope } from './checkin';
export { hasTracingEnabled } from './utils/hasTracingEnabled';
export { isSentryRequestUrl } from './utils/isSentryRequestUrl';
export { DEFAULT_ENVIRONMENT } from './constants';
export { ModuleMetadata } from './integrations/metadata';
export { RequestData } from './integrations/requestdata';
import * as Integrations from './integrations';

export { Integrations };
