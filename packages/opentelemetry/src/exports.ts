export { getScopesFromContext } from './utils/contextData';

export { enhanceDscWithOpenTelemetryRootSpanName } from './utils/enhanceDscWithOpenTelemetryRootSpanName';

export { getTraceContextForScope } from './trace';

export { suppressTracing } from './utils/suppressTracing';

export { setupEventContextTrace } from './setupEventContextTrace';

// eslint-disable-next-line typescript/no-deprecated
export { wrapContextManagerClass } from './contextManager';

export { SentryPropagator } from './propagator';
export { SentrySpanProcessor } from './spanProcessor';
export { SentrySampler, wrapSamplingDecision } from './sampler';
export { applyOtelSpanData } from './applyOtelSpanData';
export { backfillStreamedSpanDataFromOtel } from './utils/backfillStreamedSpanData';
export { SentryTracerProvider } from './tracerProvider';
export type { OpenTelemetryTracerProvider } from './types';

export { openTelemetrySetupCheck, setIsSetup } from './utils/setupCheck';

export { getSentryResource } from './resource';
