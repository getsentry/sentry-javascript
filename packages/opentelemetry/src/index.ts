export { getRequestSpanData } from './utils/getRequestSpanData';

export type { OpenTelemetryClient } from './types';
export { wrapClientClass } from './custom/client';

export { getSpanKind } from './utils/getSpanKind';

export { getScopesFromContext } from './utils/contextData';

export {
  spanHasAttributes,
  spanHasEvents,
  spanHasKind,
  spanHasName,
  spanHasParentId,
  spanHasStatus,
} from './utils/spanTypes';

export { getDynamicSamplingContextFromSpan } from './utils/dynamicSamplingContext';

export { isSentryRequestSpan } from './utils/isSentryRequest';

export { getActiveSpan } from './utils/getActiveSpan';
export { startSpan, startSpanManual, startInactiveSpan, withActiveSpan, continueTrace } from './trace';

export { suppressTracing } from './utils/suppressTracing';

// eslint-disable-next-line deprecation/deprecation
export { setupGlobalHub } from './custom/hub';
// eslint-disable-next-line deprecation/deprecation
export { getCurrentHubShim } from '@sentry/core';
export { setupEventContextTrace } from './setupEventContextTrace';

export { setOpenTelemetryContextAsyncContextStrategy } from './asyncContextStrategy';
export { wrapContextManagerClass } from './contextManager';
export { SentryPropagator } from './propagator';
export { SentrySpanProcessor } from './spanProcessor';
export { SentrySampler } from './sampler';

export { openTelemetrySetupCheck } from './utils/setupCheck';

// Legacy
export { getClient } from '@sentry/core';
