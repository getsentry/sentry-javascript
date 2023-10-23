export * from '../exports';

export type { RequestInstrumentationOptions } from './request';

export { BrowserTracing, BROWSER_TRACING_INTEGRATION_ID } from './browsertracing';
export {
  instrumentOutgoingRequests,
  defaultRequestInstrumentationOptions,
  addTracingHeadersToFetchRequest,
} from './request';

export { addPerformanceInstrumentationHandler } from './instrument';
