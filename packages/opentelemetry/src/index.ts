export { getScopesFromContext } from './utils/contextData';

export { setupEventContextTrace } from './setupEventContextTrace';

export { SentryPropagator } from './propagator';
export { applyOtelSpanData } from './applyOtelSpanData';
export { backfillStreamedSpanDataFromOtel } from './utils/backfillStreamedSpanData';
export { SentryTracerProvider } from './tracerProvider';

export { type AsyncLocalStorageLookup } from './asyncLocalStorageContextManager';

export { setOpenTelemetryContextAsyncContextStrategy } from './asyncContextStrategy';
