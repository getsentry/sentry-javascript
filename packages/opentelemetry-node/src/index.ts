export { SentrySpanProcessor } from './spanprocessor';
export { SentryPropagator } from './propagator';
export { maybeCaptureExceptionForTimedEvent } from './utils/captureExceptionForTimedEvent';
export { parseOtelSpanDescription } from './utils/parseOtelSpanDescription';
export { mapOtelStatus } from './utils/mapOtelStatus';

/* eslint-disable deprecation/deprecation */
export { addOtelSpanData, getOtelSpanData, clearOtelSpanData } from './utils/spanData';
export type { AdditionalOtelSpanData } from './utils/spanData';
/* eslint-enable deprecation/deprecation */
