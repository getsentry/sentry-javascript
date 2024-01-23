export * from '../exports';

export type { RequestInstrumentationOptions } from './request';

export {
  // eslint-disable-next-line deprecation/deprecation
  BrowserTracing,
  browserTracingIntegration,
  BROWSER_TRACING_INTEGRATION_ID,
} from './browsertracing';
export { instrumentOutgoingRequests, defaultRequestInstrumentationOptions } from './request';

export {
  addPerformanceInstrumentationHandler,
  addClsInstrumentationHandler,
  addFidInstrumentationHandler,
  addLcpInstrumentationHandler,
} from './instrument';
