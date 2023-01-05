export type { ClientClass } from './sdk';
export type { Carrier, Layer } from './hub';

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
} from './exports';
export { getCurrentHub, getHubFromCarrier, Hub, makeMain, getMainCarrier, setHubOnCarrier } from './hub';
export { makeSession, closeSession, updateSession } from './session';
export { SessionFlusher } from './sessionflusher';
export { addGlobalEventProcessor, Scope } from './scope';
export { getEnvelopeEndpointWithUrlEncodedAuth, getReportDialogEndpoint } from './api';
export { BaseClient } from './baseclient';
export { initAndBind } from './sdk';
export { createTransport } from './transports/base';
export { SDK_VERSION } from './version';
export { getIntegrationsToSetup } from './integration';
export { FunctionToString, InboundFilters } from './integrations';
export { prepareEvent } from './utils/prepareEvent';

import * as Integrations from './integrations';

export { Integrations };
