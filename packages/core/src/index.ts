export type { APIDetails } from './api';
export type { ClientClass } from './sdk';
export type {
  BaseTransportOptions,
  NewTransport,
  TransportMakeRequestResponse,
  TransportRequest,
  TransportRequestExecutor,
} from './transports/base';

export {
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  startTransaction,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
} from '@sentry/minimal';
export { addGlobalEventProcessor, getCurrentHub, getHubFromCarrier, Hub, makeMain, Scope, Session } from '@sentry/hub';
export {
  getEnvelopeEndpointWithUrlEncodedAuth,
  getStoreEndpointWithUrlEncodedAuth,
  getRequestHeaders,
  initAPIDetails,
  getReportDialogEndpoint,
} from './api';
export { BaseClient } from './baseclient';
export { eventToSentryRequest, sessionToSentryRequest } from './request';
export { initAndBind } from './sdk';
export { NoopTransport } from './transports/noop';
export { createTransport } from './transports/base';
export { SDK_VERSION } from './version';
export { getIntegrationsToSetup } from './integration';

import * as Integrations from './integrations';

export { Integrations };
