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

export type { RequestInstrumentationOptions } from './browser';
