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
  addGlobalEventProcessor,
  getCurrentHub,
  getHubFromCarrier,
  Hub,
  makeMain,
  Scope,
} from '@sentry/hub';
export { getEnvelopeEndpointWithUrlEncodedAuth, getReportDialogEndpoint } from './api';
export { BaseClient } from './baseclient';
export { initAndBind } from './sdk';
export { createTransport } from './transports/base';
export { SDK_VERSION } from './version';
export { getIntegrationsToSetup } from './integration';
export { FunctionToString, InboundFilters } from './integrations';

import * as Integrations from './integrations';

export { Integrations };
