export { updateScope, applyScopeToEvent, addGlobalEventProcessor, cloneScope, getScopeSession, Scope } from './scope';
export { Session, updateSession } from './session';
export { SessionFlusher } from './sessionflusher';
export {
  // eslint-disable-next-line deprecation/deprecation
  getActiveDomain,
  getCurrentHub,
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
  Carrier,
  // eslint-disable-next-line deprecation/deprecation
  DomainAsCarrier,
  Layer,
  getHubFromCarrier,
  setHubOnCarrier,
  getMainCarrier,
} from './hub';
