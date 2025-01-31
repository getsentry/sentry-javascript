export {
  addPerformanceInstrumentationHandler,
  addClsInstrumentationHandler,
  addFidInstrumentationHandler,
  addTtfbInstrumentationHandler,
  addLcpInstrumentationHandler,
  addInpInstrumentationHandler,
} from './metrics/instrument';

export {
  addPerformanceEntries,
  startTrackingInteractions,
  startTrackingLongTasks,
  startTrackingLongAnimationFrames,
  startTrackingWebVitals,
  startTrackingINP,
  registerInpInteractionListener,
} from './metrics/browserMetrics';

export { extractNetworkProtocol } from './metrics/utils';

export { addClickKeypressInstrumentationHandler } from './instrument/dom';

export { addHistoryInstrumentationHandler } from './instrument/history';

export { fetch, setTimeout, clearCachedImplementation, getNativeImplementation } from './getNativeImplementation';

export { addXhrInstrumentationHandler, SENTRY_XHR_DATA_KEY } from './instrument/xhr';
