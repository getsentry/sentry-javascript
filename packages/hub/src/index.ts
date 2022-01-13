export { updateScope, applyScopeToEvent, addGlobalEventProcessor, cloneScope, getScopeSession, Scope } from './scope';
export { Session, updateSession } from './session';
export { SessionFlusher } from './sessionflusher';
export {
  // eslint-disable-next-line deprecation/deprecation
  getActiveDomain,
  getCurrentHub,
  bindHubClient,
  popHubScope,
  pushHubScope,
  withHubScope,
  getHubClient,
  getHubScope,
  setHubUser,
  getHubLastEventId,
  captureHubSession,
  startHubSession,
  addHubBreadcrumb,
  captureHubEvent,
  captureHubException,
  getIntegration,
  captureHubMessage,
  configureHubScope,
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
