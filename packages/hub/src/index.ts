export { applyToEvent, addGlobalEventProcessor, cloneScope, getSession, Scope } from './scope';
export { Session, updateSession } from './session';
export { SessionFlusher } from './sessionflusher';
export {
  // eslint-disable-next-line deprecation/deprecation
  getActiveDomain,
  getCurrentHub,
  getHubFromCarrier,
  getMainCarrier,
  bindClient,
  popScope,
  pushScope,
  withScope,
  getClient,
  getScope,
  setUser,
  lastEventId,
  captureSession,
  startSession,
  addBreadcrumb,
  captureEvent,
  captureException,
  getIntegration,
  captureMessage,
  configureScope,
  Hub,
  makeMain,
  setHubOnCarrier,
  Carrier,
  // eslint-disable-next-line deprecation/deprecation
  DomainAsCarrier,
  Layer,
} from './hub';
