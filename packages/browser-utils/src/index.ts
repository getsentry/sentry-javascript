export {
  addPerformanceInstrumentationHandler,
  addClsInstrumentationHandler,
  addFidInstrumentationHandler,
  addTtfbInstrumentationHandler,
  addLcpInstrumentationHandler,
} from './metrics/instrument';

export {
  addPerformanceEntries,
  startTrackingInteractions,
  startTrackingLongTasks,
  startTrackingWebVitals,
  startTrackingINP,
} from './metrics/browserMetrics';

export { addClickKeypressInstrumentationHandler } from './instrument/dom';

export { addHistoryInstrumentationHandler } from './instrument/history';

export { fetch, setTimeout, clearCachedImplementation, getNativeImplementation } from './getNativeImplementation';

export { addXhrInstrumentationHandler, SENTRY_XHR_DATA_KEY } from './instrument/xhr';
