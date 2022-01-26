export type {
  Carrier,
  // eslint-disable-next-line deprecation/deprecation
  DomainAsCarrier,
  Layer,
} from './hub';

export { addGlobalEventProcessor, Scope } from './scope';
export { Session } from './session';
export { SessionFlusher } from './sessionflusher';
export {
  // eslint-disable-next-line deprecation/deprecation
  getActiveDomain,
  getCurrentHub,
  getHubFromCarrier,
  getMainCarrier,
  Hub,
  makeMain,
  setHubOnCarrier,
} from './hub';
