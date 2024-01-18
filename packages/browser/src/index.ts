export * from './exports';

import { Integrations as CoreIntegrations } from '@sentry/core';

import { WINDOW } from './helpers';
import * as BrowserIntegrations from './integrations';

let windowIntegrations = {};

// This block is needed to add compatibility with the integrations packages when used with a CDN
if (WINDOW.Sentry && WINDOW.Sentry.Integrations) {
  windowIntegrations = WINDOW.Sentry.Integrations;
}

const INTEGRATIONS = {
  ...windowIntegrations,
  // eslint-disable-next-line deprecation/deprecation
  ...CoreIntegrations,
  ...BrowserIntegrations,
};

export { INTEGRATIONS as Integrations };

export { Replay } from '@sentry/replay';
export type {
  ReplayEventType,
  ReplayEventWithTime,
  ReplayBreadcrumbFrame,
  ReplayBreadcrumbFrameEvent,
  ReplayOptionFrameEvent,
  ReplayFrame,
  ReplayFrameEvent,
  ReplaySpanFrame,
  ReplaySpanFrameEvent,
} from '@sentry/replay';

export { ReplayCanvas } from '@sentry-internal/replay-canvas';

export { Feedback, sendFeedback } from '@sentry-internal/feedback';

export {
  BrowserTracing,
  defaultRequestInstrumentationOptions,
  instrumentOutgoingRequests,
} from '@sentry-internal/tracing';
export type { RequestInstrumentationOptions } from '@sentry-internal/tracing';
export {
  addTracingExtensions,
  setMeasurement,
  // eslint-disable-next-line deprecation/deprecation
  extractTraceparentData,
  // eslint-disable-next-line deprecation/deprecation
  getActiveTransaction,
  spanStatusfromHttpCode,
  // eslint-disable-next-line deprecation/deprecation
  trace,
  makeMultiplexedTransport,
  // eslint-disable-next-line deprecation/deprecation
  ModuleMetadata,
  moduleMetadataIntegration,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';
export type { Span } from '@sentry/types';
export { makeBrowserOfflineTransport } from './transports/offline';
export { onProfilingStartRouteTransaction } from './profiling/hubextensions';
export { BrowserProfilingIntegration } from './profiling/integration';
