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
  ...CoreIntegrations,
  ...BrowserIntegrations,
};

export { INTEGRATIONS as Integrations };

export { Replay, replayEventCompressor } from '@sentry/replay';
export { BrowserTracing, defaultRequestInstrumentationOptions } from '@sentry-internal/tracing';
export {
  addTracingExtensions,
  extractTraceparentData,
  getActiveTransaction,
  spanStatusfromHttpCode,
  trace,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';
export type { Span } from '@sentry/types';
export { makeBrowserOfflineTransport } from './transports/offline';
export { onProfilingStartRouteTransaction } from './profiling/hubextensions';
export { BrowserProfilingIntegration } from './profiling/integration';
