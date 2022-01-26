export type { APIDetails } from './api';
export type { BackendClass } from './basebackend';
export type { ClientClass } from './sdk';

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
export { addGlobalEventProcessor, getCurrentHub, getHubFromCarrier, Hub, makeMain, Scope } from '@sentry/hub';
export {
  // eslint-disable-next-line deprecation/deprecation
  API,
  getEnvelopeEndpointWithUrlEncodedAuth,
  getStoreEndpointWithUrlEncodedAuth,
  getRequestHeaders,
  initAPIDetails,
  getReportDialogEndpoint,
} from './api';
export { BaseClient } from './baseclient';
export { BaseBackend } from './basebackend';
export { eventToSentryRequest, sessionToSentryRequest } from './request';
export { initAndBind } from './sdk';
export { NoopTransport } from './transports/noop';
export { SDK_VERSION } from './version';

import * as Integrations from './integrations';

export { Integrations };
