export * from '../exports';

export type { RequestInstrumentationOptions } from './request';

export {
  // eslint-disable-next-line deprecation/deprecation
  BrowserTracing,
  BROWSER_TRACING_INTEGRATION_ID,
} from './browsertracing';

export { browserTracingIntegration } from './browserTracingIntegration';

export { instrumentOutgoingRequests, defaultRequestInstrumentationOptions } from './request';

export {
  addPerformanceInstrumentationHandler,
  addClsInstrumentationHandler,
  addFidInstrumentationHandler,
  addLcpInstrumentationHandler,
} from './instrument';
