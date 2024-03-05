export * from './exports';

export { Express } from './node/integrations/express';

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
  addLcpInstrumentationHandler,
} from './browser';

export { addTracingHeadersToFetchRequest, instrumentFetchRequest } from './common/fetch';

export type { RequestInstrumentationOptions } from './browser';
