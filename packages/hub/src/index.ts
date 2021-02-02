// eslint-disable-next-line deprecation/deprecation
export { Carrier, DomainAsCarrier, Layer } from './interfaces';
export { addGlobalEventProcessor, Scope } from './scope';
export { Session } from './session';
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
