import { GLOBAL_OBJ } from '@sentry/utils';

export type { RequestInstrumentationOptions } from './request';

export { BrowserTracing, BROWSER_TRACING_INTEGRATION_ID } from './browsertracing';
export { instrumentOutgoingRequests, defaultRequestInstrumentationOptions } from './request';

export const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;
