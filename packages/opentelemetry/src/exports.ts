export { getScopesFromContext } from './utils/contextData';

export { enhanceDscWithOpenTelemetryRootSpanName } from './utils/enhanceDscWithOpenTelemetryRootSpanName';

export { getTraceContextForScope } from './trace';

export { setupEventContextTrace } from './setupEventContextTrace';

export { SentryPropagator } from './propagator';
export { applyOtelSpanData } from './applyOtelSpanData';
export { backfillStreamedSpanDataFromOtel } from './utils/backfillStreamedSpanData';
export { SentryTracerProvider } from './tracerProvider';

export { getSentryResource } from './resource';
