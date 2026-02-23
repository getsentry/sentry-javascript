// OTel-specific exports (not available in light mode)
export { httpIntegration } from './integrations/http';
export { httpServerSpansIntegration } from './integrations/http/httpServerSpansIntegration';
export { httpServerIntegration } from './integrations/http/httpServerIntegration';

export {
  SentryHttpInstrumentation,
  type SentryHttpInstrumentationOptions,
} from './integrations/http/SentryHttpInstrumentation';
export { nativeNodeFetchIntegration } from './integrations/node-fetch';
export {
  SentryNodeFetchInstrumentation,
  type SentryNodeFetchInstrumentationOptions,
} from './integrations/node-fetch/SentryNodeFetchInstrumentation';

export { SentryContextManager } from './otel/contextManager';
export { setupOpenTelemetryLogger } from './otel/logger';
export { generateInstrumentOnce, instrumentWhenWrapped, INSTRUMENTED } from './otel/instrument';

export { init, getDefaultIntegrations, initWithoutDefaultIntegrations, validateOpenTelemetrySetup } from './sdk';
export { setIsolationScope } from './sdk/scope';
export { NodeClient } from './sdk/client';
export { ensureIsWrapped } from './utils/ensureIsWrapped';
export { processSessionIntegration } from './integrations/processSession';

export type { OpenTelemetryServerRuntimeOptions } from './types';

export {
  // This needs exporting so the NodeClient can be used without calling init
  setOpenTelemetryContextAsyncContextStrategy as setNodeAsyncContextStrategy,
} from '@sentry/opentelemetry';

// Deprecated exports (do not add to common-exports.ts)
// eslint-disable-next-line deprecation/deprecation
export { anrIntegration, disableAnrDetectionForCallback } from './integrations/anr';
// eslint-disable-next-line deprecation/deprecation
export { inboundFiltersIntegration } from '@sentry/core';

export type { ExclusiveEventHintOrCaptureContext, CaptureContext } from '@sentry/core';

// Common exports shared with the light entry point
export * from './common-exports';
