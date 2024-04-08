export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  BROWSER_TRACING_INTEGRATION_ID,
  instrumentOutgoingRequests,
  defaultRequestInstrumentationOptions,
  addPerformanceInstrumentationHandler,
  addClsInstrumentationHandler,
  addFidInstrumentationHandler,
  addTtfbInstrumentationHandler,
  addLcpInstrumentationHandler,
} from './browser';

export { addClickKeypressInstrumentationHandler } from './instrument/dom';

export { addHistoryInstrumentationHandler } from './instrument/history';

export {
  addXhrInstrumentationHandler,
  SENTRY_XHR_DATA_KEY,
} from './instrument/xhr';

export type { RequestInstrumentationOptions } from './browser';
