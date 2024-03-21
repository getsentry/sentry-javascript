export * from './exports';

export {
  Apollo,
  Express,
  GraphQL,
  Mongo,
  Mysql,
  Postgres,
  Prisma,
  lazyLoadedNodePerformanceMonitoringIntegrations,
} from './node';
export type { LazyLoadedIntegration } from './node';

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
