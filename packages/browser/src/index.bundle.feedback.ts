// This is exported so the loader does not fail when switching off Replay/Tracing
import { Feedback, feedbackIntegration } from '@sentry-internal/feedback';
import {
  BrowserTracingShim,
  ReplayShim,
  addTracingExtensionsShim,
  browserTracingIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

import * as Sentry from './index.bundle.base';

// TODO (v8): Remove this as it was only needed for backwards compatibility
// eslint-disable-next-line deprecation/deprecation
Sentry.Integrations.Replay = ReplayShim;

// eslint-disable-next-line deprecation/deprecation
Sentry.Integrations.BrowserTracing = BrowserTracingShim;

export * from './index.bundle.base';
export {
  // eslint-disable-next-line deprecation/deprecation
  BrowserTracingShim as BrowserTracing,
  browserTracingIntegrationShim as browserTracingIntegration,
  addTracingExtensionsShim as addTracingExtensions,
  // eslint-disable-next-line deprecation/deprecation
  ReplayShim as Replay,
  replayIntegrationShim as replayIntegration,
  // eslint-disable-next-line deprecation/deprecation
  Feedback,
  feedbackIntegration,
};
// Note: We do not export a shim for `Span` here, as that is quite complex and would blow up the bundle
